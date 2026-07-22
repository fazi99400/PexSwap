// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../core/interfaces/IPexSwapFactory.sol";
import "../core/interfaces/IPXC20.sol";
import "./interfaces/IPexSwapRouter.sol";
import "./interfaces/IWPEX.sol";
import "./libraries/PexSwapLibrary.sol";

/// @title PexSwapRouter - safe, user-facing wrapper around PexSwap pairs.
/// @notice Handles native PEX <-> WPEX wrapping, slippage bounds and deadlines.
contract PexSwapRouter is IPexSwapRouter {
    address public immutable factory;
    address public immutable WPEX;
    bytes32 public immutable initCodeHash;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "PexSwapRouter: EXPIRED");
        _;
    }

    constructor(address _factory, address _WPEX) {
        factory = _factory;
        WPEX = _WPEX;
        initCodeHash = IPexSwapFactory(_factory).pairCodeHash();
    }

    receive() external payable {
        assert(msg.sender == WPEX); // only accept PEX via fallback from the WPEX contract
    }

    // ---------------------------------------------------------------------
    // Liquidity
    // ---------------------------------------------------------------------

    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        if (IPexSwapFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IPexSwapFactory(factory).createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = PexSwapLibrary.getReserves(
            PexSwapLibrary.pairFor(factory, tokenA, tokenB, initCodeHash),
            tokenA,
            tokenB
        );
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = PexSwapLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "PexSwapRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = PexSwapLibrary.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, "PexSwapRouter: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = PexSwapLibrary.pairFor(factory, tokenA, tokenB, initCodeHash);
        _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IPexSwapPair(pair).mint(to);
    }

    function addLiquidityPEX(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountPEXMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountPEX, uint256 liquidity) {
        (amountToken, amountPEX) = _addLiquidity(
            token,
            WPEX,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountPEXMin
        );
        address pair = PexSwapLibrary.pairFor(factory, token, WPEX, initCodeHash);
        _safeTransferFrom(token, msg.sender, pair, amountToken);
        IWPEX(WPEX).deposit{value: amountPEX}();
        assert(IWPEX(WPEX).transfer(pair, amountPEX));
        liquidity = IPexSwapPair(pair).mint(to);
        if (msg.value > amountPEX) _safeTransferPEX(msg.sender, msg.value - amountPEX); // refund dust
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = PexSwapLibrary.pairFor(factory, tokenA, tokenB, initCodeHash);
        IPexSwapPair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        (uint256 amount0, uint256 amount1) = IPexSwapPair(pair).burn(to);
        (address token0, ) = PexSwapLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "PexSwapRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "PexSwapRouter: INSUFFICIENT_B_AMOUNT");
    }

    function removeLiquidityPEX(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountPEXMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountToken, uint256 amountPEX) {
        (amountToken, amountPEX) = removeLiquidity(
            token,
            WPEX,
            liquidity,
            amountTokenMin,
            amountPEXMin,
            address(this),
            deadline
        );
        _safeTransfer(token, to, amountToken);
        IWPEX(WPEX).withdraw(amountPEX);
        _safeTransferPEX(to, amountPEX);
    }

    // ---------------------------------------------------------------------
    // Swaps
    // ---------------------------------------------------------------------

    // requires the initial amount to have already been sent to the first pair
    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = PexSwapLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2
                ? PexSwapLibrary.pairFor(factory, output, path[i + 2], initCodeHash)
                : _to;
            IPexSwapPair(PexSwapLibrary.pairFor(factory, input, output, initCodeHash))
                .swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = PexSwapLibrary.getAmountsOut(factory, initCodeHash, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "PexSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, PexSwapLibrary.pairFor(factory, path[0], path[1], initCodeHash), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = PexSwapLibrary.getAmountsIn(factory, initCodeHash, amountOut, path);
        require(amounts[0] <= amountInMax, "PexSwapRouter: EXCESSIVE_INPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, PexSwapLibrary.pairFor(factory, path[0], path[1], initCodeHash), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapExactPEXForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WPEX, "PexSwapRouter: INVALID_PATH");
        amounts = PexSwapLibrary.getAmountsOut(factory, initCodeHash, msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "PexSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        IWPEX(WPEX).deposit{value: amounts[0]}();
        assert(IWPEX(WPEX).transfer(PexSwapLibrary.pairFor(factory, path[0], path[1], initCodeHash), amounts[0]));
        _swap(amounts, path, to);
    }

    function swapTokensForExactPEX(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WPEX, "PexSwapRouter: INVALID_PATH");
        amounts = PexSwapLibrary.getAmountsIn(factory, initCodeHash, amountOut, path);
        require(amounts[0] <= amountInMax, "PexSwapRouter: EXCESSIVE_INPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, PexSwapLibrary.pairFor(factory, path[0], path[1], initCodeHash), amounts[0]);
        _swap(amounts, path, address(this));
        IWPEX(WPEX).withdraw(amounts[amounts.length - 1]);
        _safeTransferPEX(to, amounts[amounts.length - 1]);
    }

    function swapExactTokensForPEX(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WPEX, "PexSwapRouter: INVALID_PATH");
        amounts = PexSwapLibrary.getAmountsOut(factory, initCodeHash, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "PexSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, PexSwapLibrary.pairFor(factory, path[0], path[1], initCodeHash), amounts[0]);
        _swap(amounts, path, address(this));
        IWPEX(WPEX).withdraw(amounts[amounts.length - 1]);
        _safeTransferPEX(to, amounts[amounts.length - 1]);
    }

    function swapPEXForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WPEX, "PexSwapRouter: INVALID_PATH");
        amounts = PexSwapLibrary.getAmountsIn(factory, initCodeHash, amountOut, path);
        require(amounts[0] <= msg.value, "PexSwapRouter: EXCESSIVE_INPUT_AMOUNT");
        IWPEX(WPEX).deposit{value: amounts[0]}();
        assert(IWPEX(WPEX).transfer(PexSwapLibrary.pairFor(factory, path[0], path[1], initCodeHash), amounts[0]));
        _swap(amounts, path, to);
        if (msg.value > amounts[0]) _safeTransferPEX(msg.sender, msg.value - amounts[0]); // refund dust
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256 amountB) {
        return PexSwapLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256 amountOut) {
        return PexSwapLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256 amountIn) {
        return PexSwapLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        return PexSwapLibrary.getAmountsOut(factory, initCodeHash, amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts) {
        return PexSwapLibrary.getAmountsIn(factory, initCodeHash, amountOut, path);
    }

    // ---------------------------------------------------------------------
    // Safe transfer helpers (support non-standard PXC-20 return values)
    // ---------------------------------------------------------------------

    bytes4 private constant TRANSFER = bytes4(keccak256(bytes("transfer(address,uint256)")));
    bytes4 private constant TRANSFER_FROM = bytes4(keccak256(bytes("transferFrom(address,address,uint256)")));

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(TRANSFER, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "PexSwapRouter: TRANSFER_FAILED");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(TRANSFER_FROM, from, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "PexSwapRouter: TRANSFER_FROM_FAILED");
    }

    function _safeTransferPEX(address to, uint256 value) private {
        (bool ok, ) = to.call{value: value}("");
        require(ok, "PexSwapRouter: PEX_TRANSFER_FAILED");
    }
}
