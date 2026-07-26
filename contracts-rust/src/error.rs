//! Error codes returned by the Lifelox Rust program.

use thiserror::Error;

#[derive(Error, Debug, Copy, Clone, PartialEq, Eq)]
pub enum LifeloxError {
    #[error("pool already initialized")]
    AlreadyInitialized,
    #[error("pool not initialized")]
    NotInitialized,
    #[error("identical token mints")]
    IdenticalTokens,
    #[error("math overflow")]
    Overflow,
    #[error("insufficient liquidity")]
    InsufficientLiquidity,
    #[error("insufficient input amount")]
    InsufficientInputAmount,
    #[error("insufficient output amount")]
    InsufficientOutputAmount,
    #[error("slippage: output below minimum")]
    SlippageExceeded,
    #[error("constant-product invariant K violated")]
    InvariantK,
    #[error("deadline expired")]
    Expired,
    #[error("unauthorized signer")]
    Unauthorized,
}

impl From<LifeloxError> for u64 {
    fn from(e: LifeloxError) -> u64 {
        e as u64
    }
}
