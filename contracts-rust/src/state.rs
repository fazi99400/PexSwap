//! On-chain account layouts for Lifelox pools, stored in the shared pexli SMT.

use borsh::{BorshDeserialize, BorshSerialize};

/// A single constant-product pool between `token0` and `token1`.
///
/// The pool is a PDA derived from `["lifelox_pool", token0, token1]` so its
/// address is deterministic and can be recomputed off-chain (like the Solidity
/// factory's CREATE2 pairs). `token0 < token1` is enforced at init.
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq, Eq)]
pub struct Pool {
    /// Discriminator / version, so upgrades stay unambiguous.
    pub version: u8,
    /// Whether the pool has been initialized.
    pub is_initialized: bool,
    /// Sorted token mints (PXC-20 accounts). Either lane's tokens are valid.
    pub token0: [u8; 32],
    pub token1: [u8; 32],
    /// The pool's own token vaults holding reserves.
    pub vault0: [u8; 32],
    pub vault1: [u8; 32],
    /// The LP mint this pool controls.
    pub lp_mint: [u8; 32],
    /// Cached reserves (kept in sync with the vaults after each action).
    pub reserve0: u128,
    pub reserve1: u128,
    /// Total LP supply outstanding.
    pub lp_total_supply: u128,
    /// PDA bump seed.
    pub bump: u8,
}

impl Pool {
    pub const SEED_PREFIX: &'static [u8] = b"lifelox_pool";
    pub const VERSION: u8 = 1;

    /// Serialized size for account allocation.
    pub const LEN: usize = 1 + 1 + 32 * 5 + 16 * 3 + 1;

    pub fn is_uninitialized(&self) -> bool {
        !self.is_initialized
    }
}

/// Instruction-scoped result returned to the caller in program logs.
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq, Eq)]
pub struct SwapResult {
    pub amount_in: u128,
    pub amount_out: u128,
}
