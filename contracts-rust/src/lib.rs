//! Lifelox AMM — Rust lane for the pexli-v2 blockchain.
//!
//! A constant-product (x*y=k) automated market maker, economically identical to
//! the Solidity `LifeloxPair`, but running as a native Rust contract inside the
//! ZK-proven `execute_block`. Rust and Solidity contracts share one SMT state
//! and settle in the same block, so Lifelox can route trades across tokens from
//! either lane.

pub mod error;
pub mod instruction;
pub mod math;
pub mod processor;
pub mod state;

pub use error::LifeloxError;
pub use instruction::LifeloxInstruction;
pub use state::{Pool, SwapResult};

#[cfg(not(feature = "no-entrypoint"))]
mod entry {
    use crate::processor::Processor;
    use pexli_sdk::{
        account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
    };

    entrypoint!(process_instruction);

    /// Program entrypoint invoked by the pexli SBF runtime.
    pub fn process_instruction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        Processor::process(program_id, accounts, instruction_data)
    }
}
