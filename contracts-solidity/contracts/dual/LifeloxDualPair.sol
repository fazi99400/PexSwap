// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../core/LifeloxERC20.sol";
import "../core/libraries/Math.sol";
import "../core/interfaces/IPXC20.sol";
import "./Asset.sol";
import "./PxcBridge.sol";

/// @title LifeloxDualPair - a constant-product pool whose two sides may each be a
///        Solidity PXC-20 (ERC-20) or a Rust-lane PXC-20 (bridge). A pool can be
///        Solidity↔Solidity, Rust↔Rust, or a cross-lane Solidity↔Rust pair.
/// @notice Low-level (Uniswap-V2 style): funds are transferred IN to the pair,
///         then `mint`/`swap`/`burn` measure what arrived. On the Rust lane there
///         is no approve/transferFrom, so the sender pushes tokens to this pair's
///         address first (a tx to the Rust-VM account), then calls the pair.
contract LifeloxDualPair is LifeloxERC20 {
    uint256 public constant MINIMUM_LIQUIDITY = 10**3;
    bytes4 private constant SELECTOR = bytes4(keccak256(bytes("transfer(address,uint256)")));

    address public factory;
    Asset public asset0;
    Asset public asset1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, "Lifelox: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(address indexed sender, uint256 a0In, uint256 a1In, uint256 a0Out, uint256 a1Out, address indexed to);
    event Sync(uint112 reserve0, uint112 reserve1);

    constructor() {
        factory = msg.sender;
    }

    /// PEX is pooled natively: liquidity and swap inputs arrive here as plain
    /// value, exactly like a token transfer arrives as a balance. Every entry
    /// point that spends it is `lock`ed, so a payout cannot reenter the pool.
    receive() external payable {}

    function initialize(Asset calldata _a0, Asset calldata _a1) external {
        require(msg.sender == factory, "Lifelox: FORBIDDEN");
        asset0 = _a0;
        asset1 = _a1;
    }

    function getReserves() public view returns (uint112 _r0, uint112 _r1, uint32 _ts) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    // --- lane-aware balance + payout -------------------------------------

    function _bal(Asset memory a) internal view returns (uint256) {
        if (a.lane == Lane.Solidity) return IPXC20(a.token).balanceOf(address(this));
        if (a.lane == Lane.Rust) return PxcBridge.balanceOf20(a.id, address(this));
        return address(this).balance; // Native: the pool's own PEX
    }

    function _payout(Asset memory a, address to, uint256 amount) internal {
        if (a.lane == Lane.Solidity) {
            (bool ok, bytes memory data) = a.token.call(abi.encodeWithSelector(SELECTOR, to, amount));
            require(ok && (data.length == 0 || abi.decode(data, (bool))), "Lifelox: TRANSFER_FAILED");
        } else if (a.lane == Lane.Rust) {
            PxcBridge.transfer20(a.id, to, amount); // reverts if amount > u64
        } else {
            (bool sent, ) = to.call{value: amount}("");
            require(sent, "Lifelox: PEX_TRANSFER_FAILED");
        }
    }

    function _update(uint256 balance0, uint256 balance1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "Lifelox: OVERFLOW");
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp % 2**32);
        emit Sync(reserve0, reserve1);
    }

    // --- core: mint / burn / swap ----------------------------------------

    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 _r0, uint112 _r1, ) = getReserves();
        uint256 balance0 = _bal(asset0);
        uint256 balance1 = _bal(asset1);
        uint256 amount0 = balance0 - _r0;
        uint256 amount1 = balance1 - _r1;

        uint256 _totalSupply = totalSupply;
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min((amount0 * _totalSupply) / _r0, (amount1 * _totalSupply) / _r1);
        }
        require(liquidity > 0, "Lifelox: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        uint256 balance0 = _bal(asset0);
        uint256 balance1 = _bal(asset1);
        uint256 liquidity = balanceOf[address(this)];

        uint256 _totalSupply = totalSupply;
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "Lifelox: INSUFFICIENT_LIQUIDITY_BURNED");
        _burn(address(this), liquidity);
        _payout(asset0, to, amount0);
        _payout(asset1, to, amount1);

        _update(_bal(asset0), _bal(asset1));
        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external lock {
        require(amount0Out > 0 || amount1Out > 0, "Lifelox: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _r0, uint112 _r1, ) = getReserves();
        require(amount0Out < _r0 && amount1Out < _r1, "Lifelox: INSUFFICIENT_LIQUIDITY");

        if (amount0Out > 0) _payout(asset0, to, amount0Out);
        if (amount1Out > 0) _payout(asset1, to, amount1Out);

        uint256 balance0 = _bal(asset0);
        uint256 balance1 = _bal(asset1);
        uint256 amount0In = balance0 > _r0 - amount0Out ? balance0 - (_r0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _r1 - amount1Out ? balance1 - (_r1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "Lifelox: INSUFFICIENT_INPUT_AMOUNT");
        {
            uint256 b0Adj = balance0 * 1000 - amount0In * 3; // 0.30% fee
            uint256 b1Adj = balance1 * 1000 - amount1In * 3;
            require(b0Adj * b1Adj >= uint256(_r0) * _r1 * (1000**2), "Lifelox: K");
        }
        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function skim(address to) external lock {
        _payout(asset0, to, _bal(asset0) - reserve0);
        _payout(asset1, to, _bal(asset1) - reserve1);
    }

    function sync() external lock {
        _update(_bal(asset0), _bal(asset1));
    }
}
