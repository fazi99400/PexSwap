// Cross-lane (dual) pool helpers.
//
// A side of a cross-lane pool is an Asset, not an address:
//
//   struct Asset { Lane lane; address token; uint64 id; }   // token XOR id
//
// and the pair orders its two sides by AssetLib.key():
//
//   Solidity: keccak256( uint8(0) | token(20) )
//   Rust:     keccak256( uint8(1) | id(8 BE) )
//
// Recomputing that key here lets the UI know which side is token0 (and therefore
// which reserve is which) without an extra round-trip.

import { encodePacked, keccak256, type Address, type Hex } from "viem";
import { NATIVE_PEX, type Token } from "../config/tokens";

export const LANE_SOLIDITY = 0;
export const LANE_RUST = 1;

export interface Asset {
  lane: number;
  token: Address;
  id: bigint;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** The Asset a UI token maps to. Native PEX pools as WPEX, like the EVM router. */
export function assetFor(t: Token, wpex: Address): Asset {
  if (t.lane === "rust") return { lane: LANE_RUST, token: ZERO, id: BigInt(t.id ?? 0) };
  const token = t.address === NATIVE_PEX.address ? wpex : t.address;
  return { lane: LANE_SOLIDITY, token, id: 0n };
}

/** AssetLib.key() — the pair's ordering/identity for a side. */
export function assetKey(a: Asset): Hex {
  return a.lane === LANE_RUST
    ? keccak256(encodePacked(["uint8", "uint64"], [1, a.id]))
    : keccak256(encodePacked(["uint8", "address"], [0, a.token]));
}

/** True when `a` is token0 of the (a, b) pair — the pair sorts by key. */
export function isFirst(a: Asset, b: Asset): boolean {
  return BigInt(assetKey(a)) < BigInt(assetKey(b));
}

export function sameAsset(a: Asset, b: Asset): boolean {
  return a.lane === b.lane && (a.lane === LANE_RUST ? a.id === b.id : a.token.toLowerCase() === b.token.toLowerCase());
}

/** Tuple form viem needs for a `struct Asset` argument. */
export const assetArg = (a: Asset) => ({ lane: a.lane, token: a.token, id: a.id }) as const;
