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
///
///         Native PEX needs no wrapper: a `Lane.Native` side is pooled as PEX
///         itself. Send it as `msg.value` and the router forwards it to the pair,
///         which holds it as its own balance and pays it back out the same way.
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
        address payable addr = payable(LifeloxDualFactory(factory).getPair(a, b));
        require(addr != address(0), "LifeloxRouter: NO_PAIR");
        p = LifeloxDualPair(addr);
        inIs0 = a.key() < b.key();
    }

    /// Deliver one input side to the pair.
    ///  - Solidity: pulled with transferFrom (needs approve).
    ///  - Native:   forwarded from msg.value — no wrapper, no approve.
    ///  - Rust:     already there; the caller pushed it (nothing can pull it).
    function _deliver(Asset calldata a, address to, uint256 amount) internal {
        if (a.lane == Lane.Solidity) {
            require(IPXC20(a.token).transferFrom(msg.sender, to, amount), "LifeloxRouter: TRANSFER_FROM");
        } else if (a.lane == Lane.Native) {
            (bool sent, ) = to.call{value: amount}("");
            require(sent, "LifeloxRouter: PEX_SEND");
        }
    }

    /// PEX sent must match exactly what the native side (if any) is adding.
    function _checkValue(Asset calldata a, uint256 amountA, Asset calldata b, uint256 amountB) internal view {
        uint256 needed;
        if (a.lane == Lane.Native) needed += amountA;
        if (b.lane == Lane.Native) needed += amountB;
        require(msg.value == needed, "LifeloxRouter: PEX_AMOUNT");
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
    ) external payable ensure(deadline) returns (uint256 liquidity) {
        _checkValue(a, amountA, b, amountB);
        address payable pairAddr = payable(LifeloxDualFactory(factory).getPair(a, b));
        if (pairAddr == address(0)) pairAddr = payable(LifeloxDualFactory(factory).createPair(a, b));
        _deliver(a, pairAddr, amountA);
        _deliver(b, pairAddr, amountB);
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
    ) external payable ensure(deadline) returns (uint256 amountOut) {
        require(msg.value == (assetIn.lane == Lane.Native ? amountIn : 0), "LifeloxRouter: PEX_AMOUNT");
        (LifeloxDualPair p, bool inIs0) = _pair(assetIn, assetOut);
        (uint112 r0, uint112 r1, ) = p.getReserves();
        (uint256 reserveIn, uint256 reserveOut) = inIs0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        require(amountOut >= amountOutMin, "LifeloxRouter: INSUFFICIENT_OUTPUT");

        _deliver(assetIn, address(p), amountIn); // a Rust input is already at the pair
        // The pair pays the output out through its own lane — PEX arrives as PEX.
        (uint256 a0Out, uint256 a1Out) = inIs0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
        p.swap(a0Out, a1Out, to);
    }
}
