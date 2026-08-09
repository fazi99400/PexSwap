// Rust-lane PXC-20 tokens are addressed on the EVM by a 0x address derived from
// their numeric id. This is the ONE place that mapping lives — if the chain uses
// a different rule, change only this function.
//
// Default rule: the id sits in the low bytes of the address, optionally behind a
// fixed prefix. Set VITE_RUST_ADDR_PREFIX (e.g. "0xFFFFFFFF") if your chain uses
// a precompile-style prefix; otherwise the id is zero-padded to 20 bytes.

import { getAddress, type Address } from "viem";

const PREFIX = (import.meta.env.VITE_RUST_ADDR_PREFIX ?? "").replace(/^0x/i, "").toLowerCase();

export function isRustId(input: string): boolean {
  const s = input.trim();
  return /^[0-9]+$/.test(s);
}

/** Map a rust token id to its EVM (PXC-20) address. */
export function rustIdToAddress(id: bigint): Address {
  const idHex = id.toString(16);
  // Compose <prefix><…zeros…><idHex> into a 40-hex-char (20-byte) address.
  const body = (PREFIX + idHex).padStart(40, "0").slice(-40);
  return getAddress(("0x" + body) as Address);
}
