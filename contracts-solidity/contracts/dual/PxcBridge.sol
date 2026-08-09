// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PxcBridge — thin wrapper over the Pexli Rust-lane bridge precompile.
/// @notice The stateful precompile at 0x…0e13 lets EVM code read and move
///         Rust-lane PXC tokens. The Rust-lane actor is the EVM `caller`, so a
///         contract can only move the PXC balance it itself holds — exactly what
///         a pool needs. All amounts are u64 on the Rust lane.
library PxcBridge {
    address internal constant BRIDGE = 0x0000000000000000000000000000000000000e13;

    // ---- reads (staticcall) ----

    /// PXC-20 balance of `holder` for token `id`. Selector 0x20 | id(8) | holder(20).
    function balanceOf20(uint64 id, address holder) internal view returns (uint256) {
        (bool ok, bytes memory ret) = BRIDGE.staticcall(abi.encodePacked(bytes1(0x20), id, holder));
        require(ok && ret.length >= 32, "pxc: balance read");
        return abi.decode(ret, (uint256));
    }

    /// Decimals of token `id`. Selector 0x01 | id(8). Absent metadata reads as 0.
    function decimals20(uint64 id) internal view returns (uint8) {
        (bool ok, bytes memory ret) = BRIDGE.staticcall(abi.encodePacked(bytes1(0x01), id));
        require(ok && ret.length >= 32, "pxc: decimals read");
        return uint8(uint256(abi.decode(ret, (bytes32))));
    }

    /// Symbol of token `id` as raw bytes32 (utf-8, right-padded). Selector 0x02.
    function symbol20(uint64 id) internal view returns (bytes32) {
        (bool ok, bytes memory ret) = BRIDGE.staticcall(abi.encodePacked(bytes1(0x02), id));
        require(ok && ret.length >= 32, "pxc: symbol read");
        return abi.decode(ret, (bytes32));
    }

    /// Name of token `id` as raw bytes32. Selector 0x03.
    function name20(uint64 id) internal view returns (bytes32) {
        (bool ok, bytes memory ret) = BRIDGE.staticcall(abi.encodePacked(bytes1(0x03), id));
        require(ok && ret.length >= 32, "pxc: name read");
        return abi.decode(ret, (bytes32));
    }

    // ---- writes (call) ----

    /// Move `amount` of PXC-20 `id` from THIS contract to `to`.
    /// Selector 0xA0 | id(8) | to(20) | amount(8 BE). Reverts on failure.
    function transfer20(uint64 id, address to, uint256 amount) internal {
        require(amount <= type(uint64).max, "pxc: amount exceeds u64");
        (bool ok, bytes memory ret) =
            BRIDGE.call(abi.encodePacked(bytes1(0xA0), id, to, uint64(amount)));
        require(ok, "pxc: transfer call");
        if (ret.length >= 32) require(abi.decode(ret, (bool)), "pxc: transfer rejected");
    }
}
