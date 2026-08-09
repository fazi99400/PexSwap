// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// A pool side is one of two lanes:
///  - Solidity: an ordinary PXC-20 (ERC-20) contract at `token`.
///  - Rust:     a Rust-lane PXC-20 identified by numeric `id` (no address),
///              read/written through the bridge precompile.
enum Lane {
    Solidity,
    Rust
}

/// Exactly one of (`token`, `id`) is meaningful, decided by `lane`.
struct Asset {
    Lane lane;
    address token; // Lane.Solidity: the ERC-20 address
    uint64 id; // Lane.Rust: the PXC token id
}

library AssetLib {
    /// Stable identity used for ordering/keys (address for Solidity, id for Rust).
    function key(Asset memory a) internal pure returns (bytes32) {
        return a.lane == Lane.Solidity
            ? keccak256(abi.encodePacked(uint8(0), a.token))
            : keccak256(abi.encodePacked(uint8(1), a.id));
    }

    function eq(Asset memory a, Asset memory b) internal pure returns (bool) {
        return a.lane == b.lane
            && (a.lane == Lane.Solidity ? a.token == b.token : a.id == b.id);
    }
}
