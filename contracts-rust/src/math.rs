//! Pure constant-product (x*y=k) math for PexSwap.
//!
//! Identical economics to the Solidity `PexSwapPair`: 0.30% swap fee, so a
//! Rust-lane pool and a Solidity-lane pool price a trade the same way.
//! Everything here is `no_std`-friendly and unit-tested with `u128` intermediates
//! to avoid overflow.

/// Swap fee numerator / denominator => 0.30% fee (997/1000).
pub const FEE_NUMERATOR: u128 = 997;
pub const FEE_DENOMINATOR: u128 = 1000;

/// Minimum liquidity permanently locked on first mint (mirrors Uniswap V2).
pub const MINIMUM_LIQUIDITY: u128 = 1_000;

/// Integer square root (Babylonian method).
pub fn sqrt(y: u128) -> u128 {
    if y > 3 {
        let mut z = y;
        let mut x = y / 2 + 1;
        while x < z {
            z = x;
            x = (y / x + x) / 2;
        }
        z
    } else if y != 0 {
        1
    } else {
        0
    }
}

/// Amount of the other asset that is price-equivalent to `amount_a` given reserves.
pub fn quote(amount_a: u128, reserve_a: u128, reserve_b: u128) -> Option<u128> {
    if amount_a == 0 || reserve_a == 0 || reserve_b == 0 {
        return None;
    }
    amount_a.checked_mul(reserve_b)?.checked_div(reserve_a)
}

/// Maximum output for a given input, after the 0.30% fee.
pub fn get_amount_out(amount_in: u128, reserve_in: u128, reserve_out: u128) -> Option<u128> {
    if amount_in == 0 || reserve_in == 0 || reserve_out == 0 {
        return None;
    }
    let amount_in_with_fee = amount_in.checked_mul(FEE_NUMERATOR)?;
    let numerator = amount_in_with_fee.checked_mul(reserve_out)?;
    let denominator = reserve_in
        .checked_mul(FEE_DENOMINATOR)?
        .checked_add(amount_in_with_fee)?;
    numerator.checked_div(denominator)
}

/// Required input to receive an exact output, after the 0.30% fee.
pub fn get_amount_in(amount_out: u128, reserve_in: u128, reserve_out: u128) -> Option<u128> {
    if amount_out == 0 || reserve_in == 0 || reserve_out == 0 || amount_out >= reserve_out {
        return None;
    }
    let numerator = reserve_in
        .checked_mul(amount_out)?
        .checked_mul(FEE_DENOMINATOR)?;
    let denominator = reserve_out
        .checked_sub(amount_out)?
        .checked_mul(FEE_NUMERATOR)?;
    numerator.checked_div(denominator)?.checked_add(1)
}

/// LP tokens minted for a deposit. `total_supply == 0` bootstraps the pool.
pub fn liquidity_minted(
    total_supply: u128,
    amount0: u128,
    amount1: u128,
    reserve0: u128,
    reserve1: u128,
) -> Option<u128> {
    if total_supply == 0 {
        sqrt(amount0.checked_mul(amount1)?).checked_sub(MINIMUM_LIQUIDITY)
    } else {
        let a = amount0.checked_mul(total_supply)?.checked_div(reserve0)?;
        let b = amount1.checked_mul(total_supply)?.checked_div(reserve1)?;
        Some(core::cmp::min(a, b))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqrt_matches_expected() {
        assert_eq!(sqrt(0), 0);
        assert_eq!(sqrt(1), 1);
        assert_eq!(sqrt(4), 2);
        assert_eq!(sqrt(1_000_000), 1000);
    }

    #[test]
    fn amount_out_applies_fee() {
        // 1000 in against 1_000_000 / 1_000_000 reserves.
        let out = get_amount_out(1000, 1_000_000, 1_000_000).unwrap();
        // Slightly less than 1000 due to the 0.30% fee + curve.
        assert!(out < 1000 && out > 990);
    }

    #[test]
    fn in_out_are_inverse_within_one() {
        let reserve_in = 5_000_000u128;
        let reserve_out = 10_000_000u128;
        let out = get_amount_out(10_000, reserve_in, reserve_out).unwrap();
        let needed = get_amount_in(out, reserve_in, reserve_out).unwrap();
        // get_amount_in rounds up, so it should be >= the original input, within a hair.
        assert!(needed >= 10_000 && needed <= 10_002);
    }

    #[test]
    fn first_mint_locks_minimum() {
        let liq = liquidity_minted(0, 1_000_000, 1_000_000, 0, 0).unwrap();
        assert_eq!(liq, 1_000_000 - MINIMUM_LIQUIDITY);
    }
}
