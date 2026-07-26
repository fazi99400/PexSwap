//! Borsh-encoded instruction set for the Lifelox Rust program.

use borsh::{BorshDeserialize, BorshSerialize};

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq, Eq)]
pub enum LifeloxInstruction {
    /// Create and initialize a new pool for (token0, token1).
    ///
    /// Accounts:
    ///   0. `[signer]`        payer / creator
    ///   1. `[writable]`      pool PDA (uninitialized)
    ///   2. `[]`              token0 mint
    ///   3. `[]`              token1 mint
    ///   4. `[writable]`      vault0 (pool-owned token0 account)
    ///   5. `[writable]`      vault1 (pool-owned token1 account)
    ///   6. `[writable]`      lp_mint (pool-controlled)
    ///   7. `[]`              pxc20 token program
    ///   8. `[]`              system program
    InitializePool,

    /// Deposit both tokens and mint LP tokens.
    ///
    /// Accounts:
    ///   0. `[signer]`   liquidity provider
    ///   1. `[writable]` pool PDA
    ///   2. `[writable]` user token0 account
    ///   3. `[writable]` user token1 account
    ///   4. `[writable]` vault0
    ///   5. `[writable]` vault1
    ///   6. `[writable]` lp_mint
    ///   7. `[writable]` user lp account
    ///   8. `[]`         pxc20 token program
    AddLiquidity {
        amount0_desired: u128,
        amount1_desired: u128,
        amount0_min: u128,
        amount1_min: u128,
    },

    /// Burn LP tokens and withdraw the underlying reserves pro-rata.
    RemoveLiquidity {
        liquidity: u128,
        amount0_min: u128,
        amount1_min: u128,
    },

    /// Swap an exact input amount for as much output as the curve allows.
    ///
    /// `zero_for_one = true` sells token0 for token1.
    SwapExactIn {
        amount_in: u128,
        min_amount_out: u128,
        zero_for_one: bool,
    },

    /// Swap up to `max_amount_in` for an exact output amount.
    SwapExactOut {
        amount_out: u128,
        max_amount_in: u128,
        zero_for_one: bool,
    },
}

impl LifeloxInstruction {
    pub fn pack(&self) -> Vec<u8> {
        borsh::to_vec(self).expect("instruction serialization is infallible")
    }

    pub fn unpack(data: &[u8]) -> Result<Self, borsh::io::Error> {
        Self::try_from_slice(data)
    }
}
