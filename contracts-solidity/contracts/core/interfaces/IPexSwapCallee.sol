// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPexSwapCallee - receiver hook for flash swaps
interface IPexSwapCallee {
    function pexSwapCall(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external;
}
