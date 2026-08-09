// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Asset.sol";
import "./LifeloxDualPair.sol";
import "./LifeloxDualFactory.sol";
import "../core/interfaces/IPXC20.sol";

/// @title LifeloxDualRouter - safe entry point for cross-lane pools.
/// @notice Solidity-lane inputs are pulled with transferFrom (needs approve).
///         Rust-lane inputs cannot be pulled (no approve on the Rust lane), so
///         the caller MUST first push the Rust tokens to the pair address (a tx
///         to the Rust-VM account), then call the router, which measures what
///         arrived — the Uniswap-V2 "transfer in, then call" pattern.
contract LifeloxDualRouter {
    using AssetLib for Asset;

    address public immutable factory;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "LifeloxRouter: EXPIRED");
        _;
    }

    constructor(address _factory) {
        factory = _factory;
    }

    // --- pure AMM math (0.30% fee) ---------------------------------------

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public pure returns (uint256)
    {
        require(amountIn > 0, "LifeloxRouter: INSUFFICIENT_INPUT");
        require(reserveIn > 0 && reserveOut > 0, "LifeloxRouter: NO_LIQUIDITY");
        uint256 inWithFee = amountIn * 997;
        return (inWithFee * reserveOut) / (reserveIn * 1000 + inWithFee);
    }

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure returns (uint256) {
        require(amountA > 0, "LifeloxRouter: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "LifeloxRouter: NO_LIQUIDITY");
        return (amountA * reserveB) / reserveA;
    }

    // --- helpers ----------------------------------------------------------

    function _pair(Asset calldata a, Asset calldata b) internal view returns (LifeloxDualPair p, bool inIs0) {
        address addr = LifeloxDualFactory(factory).getPair(a, b);
        require(addr != address(0), "LifeloxRouter: NO_PAIR");
        p = LifeloxDualPair(addr);
        inIs0 = a.key() < b.key();
    }

    function _pullSolidity(Asset calldata a, address to, uint256 amount) internal {
        if (a.lane == Lane.Solidity) {
            require(IPXC20(a.token).transferFrom(msg.sender, to, amount), "LifeloxRouter: TRANSFER_FROM");
        }
        // Rust lane: caller already pushed the tokens to `to` (the pair).
    }

    // --- liquidity --------------------------------------------------------

    /// Add liquidity to (a, b). For a Solidity asset the amount is pulled from
    /// the caller; for a Rust asset the caller must have already sent it to the
    /// pair. Creates the pair if it does not exist.
    function addLiquidity(
        Asset calldata a,
        Asset calldata b,
        uint256 amountA,
        uint256 amountB,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 liquidity) {
        address pairAddr = LifeloxDualFactory(factory).getPair(a, b);
        if (pairAddr == address(0)) pairAddr = LifeloxDualFactory(factory).createPair(a, b);
        _pullSolidity(a, pairAddr, amountA);
        _pullSolidity(b, pairAddr, amountB);
        liquidity = LifeloxDualPair(pairAddr).mint(to);
    }

    // --- swap -------------------------------------------------------------

    /// Swap an exact input amount of `assetIn` for `assetOut`.
    /// Solidity input is pulled via transferFrom; Rust input must be pushed to
    /// the pair by the caller beforehand (then this measures it).
    function swapExactInput(
        Asset calldata assetIn,
        Asset calldata assetOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountOut) {
        (LifeloxDualPair p, bool inIs0) = _pair(assetIn, assetOut);
        (uint112 r0, uint112 r1, ) = p.getReserves();
        (uint256 reserveIn, uint256 reserveOut) = inIs0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        require(amountOut >= amountOutMin, "LifeloxRouter: INSUFFICIENT_OUTPUT");

        _pullSolidity(assetIn, address(p), amountIn); // Rust input already at the pair
        (uint256 a0Out, uint256 a1Out) = inIs0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
        p.swap(a0Out, a1Out, to);
    }
}
