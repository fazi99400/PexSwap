//! Instruction processing for the Lifelox Rust program.
//!
//! Uses the pexli SDK's Solana-style account model and cross-program invocation
//! (CPI) into the PXC-20 token program to move funds. Because Rust and Solidity
//! settle in the same pexli block against one SMT, a Rust pool and a Solidity
//! pair are fully interoperable for routing.

use crate::error::LifeloxError;
use crate::instruction::LifeloxInstruction;
use crate::math;
use crate::state::{Pool, SwapResult};

use borsh::BorshDeserialize;
use pexli_sdk::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    token, // PXC-20 CPI helpers: transfer, mint_to, burn
};

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let ix = LifeloxInstruction::try_from_slice(instruction_data)
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        match ix {
            LifeloxInstruction::InitializePool => {
                msg!("Lifelox: InitializePool");
                Self::initialize_pool(program_id, accounts)
            }
            LifeloxInstruction::AddLiquidity {
                amount0_desired,
                amount1_desired,
                amount0_min,
                amount1_min,
            } => {
                msg!("Lifelox: AddLiquidity");
                Self::add_liquidity(
                    program_id,
                    accounts,
                    amount0_desired,
                    amount1_desired,
                    amount0_min,
                    amount1_min,
                )
            }
            LifeloxInstruction::RemoveLiquidity {
                liquidity,
                amount0_min,
                amount1_min,
            } => {
                msg!("Lifelox: RemoveLiquidity");
                Self::remove_liquidity(program_id, accounts, liquidity, amount0_min, amount1_min)
            }
            LifeloxInstruction::SwapExactIn {
                amount_in,
                min_amount_out,
                zero_for_one,
            } => {
                msg!("Lifelox: SwapExactIn");
                Self::swap_exact_in(program_id, accounts, amount_in, min_amount_out, zero_for_one)
            }
            LifeloxInstruction::SwapExactOut {
                amount_out,
                max_amount_in,
                zero_for_one,
            } => {
                msg!("Lifelox: SwapExactOut");
                Self::swap_exact_out(program_id, accounts, amount_out, max_amount_in, zero_for_one)
            }
        }
    }

    fn load_pool(account: &AccountInfo) -> Result<Pool, ProgramError> {
        Pool::try_from_slice(&account.data.borrow())
            .map_err(|_| ProgramError::InvalidAccountData)
    }

    fn save_pool(account: &AccountInfo, pool: &Pool) -> ProgramResult {
        let mut data = account.data.borrow_mut();
        borsh::to_writer(&mut data[..], pool).map_err(|_| ProgramError::AccountDataTooSmall)?;
        Ok(())
    }

    fn pool_signer_seeds<'a>(pool: &'a Pool) -> [&'a [u8]; 4] {
        [
            Pool::SEED_PREFIX,
            &pool.token0,
            &pool.token1,
            core::slice::from_ref(&pool.bump),
        ]
    }

    fn initialize_pool(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let iter = &mut accounts.iter();
        let _creator = next_account_info(iter)?;
        let pool_ai = next_account_info(iter)?;
        let token0_mint = next_account_info(iter)?;
        let token1_mint = next_account_info(iter)?;
        let vault0 = next_account_info(iter)?;
        let vault1 = next_account_info(iter)?;
        let lp_mint = next_account_info(iter)?;

        if token0_mint.key == token1_mint.key {
            return Err(LifeloxError::IdenticalTokens.into());
        }

        // Enforce canonical ordering so (A,B) and (B,A) map to the same PDA.
        let (t0, t1, v0, v1) = if token0_mint.key.to_bytes() < token1_mint.key.to_bytes() {
            (token0_mint, token1_mint, vault0, vault1)
        } else {
            (token1_mint, token0_mint, vault1, vault0)
        };

        let (expected_pda, bump) = Pubkey::find_program_address(
            &[Pool::SEED_PREFIX, &t0.key.to_bytes(), &t1.key.to_bytes()],
            program_id,
        );
        if &expected_pda != pool_ai.key {
            return Err(ProgramError::InvalidSeeds);
        }

        let existing = Self::load_pool(pool_ai);
        if let Ok(p) = existing {
            if p.is_initialized {
                return Err(LifeloxError::AlreadyInitialized.into());
            }
        }

        let pool = Pool {
            version: Pool::VERSION,
            is_initialized: true,
            token0: t0.key.to_bytes(),
            token1: t1.key.to_bytes(),
            vault0: v0.key.to_bytes(),
            vault1: v1.key.to_bytes(),
            lp_mint: lp_mint.key.to_bytes(),
            reserve0: 0,
            reserve1: 0,
            lp_total_supply: 0,
            bump,
        };
        Self::save_pool(pool_ai, &pool)?;
        msg!("Lifelox: pool initialized");
        Ok(())
    }

    fn add_liquidity(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount0_desired: u128,
        amount1_desired: u128,
        amount0_min: u128,
        amount1_min: u128,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let provider = next_account_info(iter)?;
        let pool_ai = next_account_info(iter)?;
        let user0 = next_account_info(iter)?;
        let user1 = next_account_info(iter)?;
        let vault0 = next_account_info(iter)?;
        let vault1 = next_account_info(iter)?;
        let lp_mint = next_account_info(iter)?;
        let user_lp = next_account_info(iter)?;
        let token_program = next_account_info(iter)?;

        let mut pool = Self::load_pool(pool_ai)?;
        if !pool.is_initialized {
            return Err(LifeloxError::NotInitialized.into());
        }

        // Determine optimal amounts that preserve the pool ratio.
        let (amount0, amount1) = if pool.reserve0 == 0 && pool.reserve1 == 0 {
            (amount0_desired, amount1_desired)
        } else {
            let amount1_optimal = math::quote(amount0_desired, pool.reserve0, pool.reserve1)
                .ok_or(LifeloxError::Overflow)?;
            if amount1_optimal <= amount1_desired {
                if amount1_optimal < amount1_min {
                    return Err(LifeloxError::SlippageExceeded.into());
                }
                (amount0_desired, amount1_optimal)
            } else {
                let amount0_optimal = math::quote(amount1_desired, pool.reserve1, pool.reserve0)
                    .ok_or(LifeloxError::Overflow)?;
                if amount0_optimal < amount0_min {
                    return Err(LifeloxError::SlippageExceeded.into());
                }
                (amount0_optimal, amount1_desired)
            }
        };

        let liquidity = math::liquidity_minted(
            pool.lp_total_supply,
            amount0,
            amount1,
            pool.reserve0,
            pool.reserve1,
        )
        .ok_or(LifeloxError::InsufficientLiquidity)?;
        if liquidity == 0 {
            return Err(LifeloxError::InsufficientLiquidity.into());
        }

        // Pull the two tokens from the provider into the pool vaults (PXC-20 CPI).
        token::transfer(token_program, user0, vault0, provider, amount0)?;
        token::transfer(token_program, user1, vault1, provider, amount1)?;

        // On first mint, permanently lock MINIMUM_LIQUIDITY into the pool itself.
        if pool.lp_total_supply == 0 {
            pool.lp_total_supply = pool
                .lp_total_supply
                .checked_add(math::MINIMUM_LIQUIDITY)
                .ok_or(LifeloxError::Overflow)?;
        }

        // Mint LP to the provider, pool PDA signs for its own LP mint authority.
        let seeds = Self::pool_signer_seeds(&pool);
        token::mint_to(token_program, lp_mint, user_lp, pool_ai, liquidity, &[&seeds])?;

        pool.reserve0 = pool.reserve0.checked_add(amount0).ok_or(LifeloxError::Overflow)?;
        pool.reserve1 = pool.reserve1.checked_add(amount1).ok_or(LifeloxError::Overflow)?;
        pool.lp_total_supply = pool
            .lp_total_supply
            .checked_add(liquidity)
            .ok_or(LifeloxError::Overflow)?;
        Self::save_pool(pool_ai, &pool)?;

        msg!("Lifelox: minted {} LP", liquidity);
        Ok(())
    }

    fn remove_liquidity(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        liquidity: u128,
        amount0_min: u128,
        amount1_min: u128,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let provider = next_account_info(iter)?;
        let pool_ai = next_account_info(iter)?;
        let user0 = next_account_info(iter)?;
        let user1 = next_account_info(iter)?;
        let vault0 = next_account_info(iter)?;
        let vault1 = next_account_info(iter)?;
        let lp_mint = next_account_info(iter)?;
        let user_lp = next_account_info(iter)?;
        let token_program = next_account_info(iter)?;

        let mut pool = Self::load_pool(pool_ai)?;
        if !pool.is_initialized || pool.lp_total_supply == 0 {
            return Err(LifeloxError::NotInitialized.into());
        }

        // Pro-rata share of each reserve.
        let amount0 = liquidity
            .checked_mul(pool.reserve0)
            .and_then(|v| v.checked_div(pool.lp_total_supply))
            .ok_or(LifeloxError::Overflow)?;
        let amount1 = liquidity
            .checked_mul(pool.reserve1)
            .and_then(|v| v.checked_div(pool.lp_total_supply))
            .ok_or(LifeloxError::Overflow)?;
        if amount0 < amount0_min || amount1 < amount1_min {
            return Err(LifeloxError::SlippageExceeded.into());
        }
        if amount0 == 0 || amount1 == 0 {
            return Err(LifeloxError::InsufficientLiquidity.into());
        }

        // Burn the provider's LP, then release the reserves.
        token::burn(token_program, lp_mint, user_lp, provider, liquidity)?;

        let seeds = Self::pool_signer_seeds(&pool);
        token::transfer_signed(token_program, vault0, user0, pool_ai, amount0, &[&seeds])?;
        token::transfer_signed(token_program, vault1, user1, pool_ai, amount1, &[&seeds])?;

        pool.reserve0 = pool.reserve0.checked_sub(amount0).ok_or(LifeloxError::Overflow)?;
        pool.reserve1 = pool.reserve1.checked_sub(amount1).ok_or(LifeloxError::Overflow)?;
        pool.lp_total_supply = pool
            .lp_total_supply
            .checked_sub(liquidity)
            .ok_or(LifeloxError::Overflow)?;
        Self::save_pool(pool_ai, &pool)?;

        msg!("Lifelox: burned {} LP", liquidity);
        Ok(())
    }

    fn swap_exact_in(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount_in: u128,
        min_amount_out: u128,
        zero_for_one: bool,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let trader = next_account_info(iter)?;
        let pool_ai = next_account_info(iter)?;
        let user_in = next_account_info(iter)?;
        let user_out = next_account_info(iter)?;
        let vault_in = next_account_info(iter)?;
        let vault_out = next_account_info(iter)?;
        let token_program = next_account_info(iter)?;

        let mut pool = Self::load_pool(pool_ai)?;
        if !pool.is_initialized {
            return Err(LifeloxError::NotInitialized.into());
        }

        let (reserve_in, reserve_out) = if zero_for_one {
            (pool.reserve0, pool.reserve1)
        } else {
            (pool.reserve1, pool.reserve0)
        };

        let amount_out = math::get_amount_out(amount_in, reserve_in, reserve_out)
            .ok_or(LifeloxError::InsufficientLiquidity)?;
        if amount_out < min_amount_out {
            return Err(LifeloxError::SlippageExceeded.into());
        }

        Self::settle_swap(
            &mut pool,
            token_program,
            trader,
            user_in,
            user_out,
            vault_in,
            vault_out,
            pool_ai,
            amount_in,
            amount_out,
            zero_for_one,
        )?;

        let result = SwapResult { amount_in, amount_out };
        msg!("Lifelox: swapped {} in for {} out", result.amount_in, result.amount_out);
        Ok(())
    }

    fn swap_exact_out(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount_out: u128,
        max_amount_in: u128,
        zero_for_one: bool,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let trader = next_account_info(iter)?;
        let pool_ai = next_account_info(iter)?;
        let user_in = next_account_info(iter)?;
        let user_out = next_account_info(iter)?;
        let vault_in = next_account_info(iter)?;
        let vault_out = next_account_info(iter)?;
        let token_program = next_account_info(iter)?;

        let mut pool = Self::load_pool(pool_ai)?;
        if !pool.is_initialized {
            return Err(LifeloxError::NotInitialized.into());
        }

        let (reserve_in, reserve_out) = if zero_for_one {
            (pool.reserve0, pool.reserve1)
        } else {
            (pool.reserve1, pool.reserve0)
        };

        let amount_in = math::get_amount_in(amount_out, reserve_in, reserve_out)
            .ok_or(LifeloxError::InsufficientLiquidity)?;
        if amount_in > max_amount_in {
            return Err(LifeloxError::SlippageExceeded.into());
        }

        Self::settle_swap(
            &mut pool,
            token_program,
            trader,
            user_in,
            user_out,
            vault_in,
            vault_out,
            pool_ai,
            amount_in,
            amount_out,
            zero_for_one,
        )?;

        msg!("Lifelox: paid {} in for exact {} out", amount_in, amount_out);
        Ok(())
    }

    /// Shared token movement + reserve/invariant update for both swap kinds.
    #[allow(clippy::too_many_arguments)]
    fn settle_swap<'a>(
        pool: &mut Pool,
        token_program: &AccountInfo<'a>,
        trader: &AccountInfo<'a>,
        user_in: &AccountInfo<'a>,
        user_out: &AccountInfo<'a>,
        vault_in: &AccountInfo<'a>,
        vault_out: &AccountInfo<'a>,
        pool_ai: &AccountInfo<'a>,
        amount_in: u128,
        amount_out: u128,
        zero_for_one: bool,
    ) -> ProgramResult {
        let (reserve_in_before, reserve_out_before) = if zero_for_one {
            (pool.reserve0, pool.reserve1)
        } else {
            (pool.reserve1, pool.reserve0)
        };

        // Move input in, output out (output leg signed by the pool PDA).
        token::transfer(token_program, user_in, vault_in, trader, amount_in)?;
        let seeds = Self::pool_signer_seeds(pool);
        token::transfer_signed(token_program, vault_out, user_out, pool_ai, amount_out, &[&seeds])?;

        let new_reserve_in = reserve_in_before
            .checked_add(amount_in)
            .ok_or(LifeloxError::Overflow)?;
        let new_reserve_out = reserve_out_before
            .checked_sub(amount_out)
            .ok_or(LifeloxError::InsufficientLiquidity)?;

        // Enforce the fee-adjusted invariant: k must not decrease.
        // (reserve_in*1000 + amount_in*997/... ) — mirror of the Solidity K check.
        let adj_in = new_reserve_in
            .checked_mul(math::FEE_DENOMINATOR)
            .ok_or(LifeloxError::Overflow)?
            .checked_sub(amount_in.checked_mul(3).ok_or(LifeloxError::Overflow)?)
            .ok_or(LifeloxError::Overflow)?;
        let adj_out = new_reserve_out
            .checked_mul(math::FEE_DENOMINATOR)
            .ok_or(LifeloxError::Overflow)?;
        let lhs = adj_in.checked_mul(adj_out).ok_or(LifeloxError::Overflow)?;
        let rhs = reserve_in_before
            .checked_mul(reserve_out_before)
            .ok_or(LifeloxError::Overflow)?
            .checked_mul(math::FEE_DENOMINATOR * math::FEE_DENOMINATOR)
            .ok_or(LifeloxError::Overflow)?;
        if lhs < rhs {
            return Err(LifeloxError::InvariantK.into());
        }

        if zero_for_one {
            pool.reserve0 = new_reserve_in;
            pool.reserve1 = new_reserve_out;
        } else {
            pool.reserve1 = new_reserve_in;
            pool.reserve0 = new_reserve_out;
        }
        Self::save_pool(pool_ai, pool)
    }
}
