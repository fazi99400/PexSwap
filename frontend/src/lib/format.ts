import { formatUnits, parseUnits } from "viem";

export function fmt(value: bigint | undefined, decimals: number, maxFrac = 6): string {
  if (value === undefined) return "0";
  const s = formatUnits(value, decimals);
  const [int, frac = ""] = s.split(".");
  if (!frac) return int;
  return `${int}.${frac.slice(0, maxFrac)}`.replace(/\.?0+$/, "") || int;
}

/**
 * A reserve, never rounded away to "0". A cross-lane pool can hold a dust amount
 * (a u64 push against an 18-decimal token), and printing that as `0` hides the
 * very thing that makes the pool's price look insane — so tiny values fall back
 * to significant digits, and then to raw base units.
 */
export function fmtReserve(value: bigint | undefined, decimals: number): string {
  if (value === undefined || value === 0n) return "0";
  const n = Number(formatUnits(value, decimals));
  if (n >= 0.01) return fmt(value, decimals, 2);
  if (n > 0) return `${n.toExponential(2).replace("e-", "e−")}`;
  return `${value} units`; // below double precision — show what the chain holds
}

export function parse(value: string, decimals: number): bigint {
  if (!value || Number.isNaN(Number(value))) return 0n;
  try {
    return parseUnits(value as `${number}`, decimals);
  } catch {
    return 0n;
  }
}

/**
 * A price for the Tokens table. A pool seeded with a dust amount on one side
 * produces a genuinely enormous (or tiny) price — printing it as a 17-digit
 * integer reads like a balance, so extremes are shown in exponent form.
 */
export function fmtPrice(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9 || abs < 1e-6) {
    const [mantissa, exp] = value.toExponential(4).split("e");
    return `${Number(mantissa)}e${Number(exp)}`;
  }
  return value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

export function shortAddr(addr?: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export const deadline = (minutes = 20) =>
  BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
