// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// A pool side is one of three lanes:
///  - Solidity: an ordinary PXC-20 (ERC-20) contract at `token`.
///  - Rust:     a Rust-lane PXC-20 identified by numeric `id` (no address),
///              read/written through the bridge precompile.
///  - Native:   PEX itself. The pair holds it as its own balance, so pooling PEX
///              needs no wrapper token — neither `token` nor `id` is used.
enum Lane {
    Solidity,
    Rust,
    Native
}

/// Which of (`token`, `id`) is meaningful is decided by `lane`; Native uses neither.
struct Asset {
    Lane lane;
    address token; // Lane.Solidity: the ERC-20 address
    uint64 id; // Lane.Rust: the PXC token id
}

library AssetLib {
    /// Stable identity used for ordering/keys (address for Solidity, id for Rust,
    /// and the lane tag alone for Native — there is only one PEX).
    function key(Asset memory a) internal pure returns (bytes32) {
        if (a.lane == Lane.Solidity) return keccak256(abi.encodePacked(uint8(0), a.token));
        if (a.lane == Lane.Rust) return keccak256(abi.encodePacked(uint8(1), a.id));
        return keccak256(abi.encodePacked(uint8(2)));
    }

    function eq(Asset memory a, Asset memory b) internal pure returns (bool) {
        if (a.lane != b.lane) return false;
        if (a.lane == Lane.Solidity) return a.token == b.token;
        if (a.lane == Lane.Rust) return a.id == b.id;
        return true; // Native == Native
    }
}
