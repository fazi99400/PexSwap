import { formatUnits, parseUnits } from "viem";

export function fmt(value: bigint | undefined, decimals: number, maxFrac = 6): string {
  if (value === undefined) return "0";
  const s = formatUnits(value, decimals);
  const [int, frac = ""] = s.split(".");
  if (!frac) return int;
  return `${int}.${frac.slice(0, maxFrac)}`.replace(/\.?0+$/, "") || int;
}

export function parse(value: string, decimals: number): bigint {
  if (!value || Number.isNaN(Number(value))) return 0n;
  try {
    return parseUnits(value as `${number}`, decimals);
  } catch {
    return 0n;
  }
}

export function shortAddr(addr?: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export const deadline = (minutes = 20) =>
  BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
