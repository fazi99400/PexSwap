// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ILifeloxCallee - receiver hook for flash swaps
interface ILifeloxCallee {
    function lifeloxCall(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external;
}
