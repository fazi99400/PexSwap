// Cross-lane (dual) pool helpers.
//
// A side of a cross-lane pool is an Asset, not an address:
//
//   struct Asset { Lane lane; address token; uint64 id; }
//
// with three lanes — a Solidity ERC-20, a Rust-lane id, or native PEX itself
// (the pair holds PEX as its own balance, so nothing is ever wrapped). The pair
// orders its two sides by AssetLib.key():
//
//   Solidity: keccak256( uint8(0) | token(20) )
//   Rust:     keccak256( uint8(1) | id(8 BE) )
//   Native:   keccak256( uint8(2) )              — there is only one PEX
//
// Recomputing that key here lets the UI know which side is token0 (and therefore
// which reserve is which) without an extra round-trip.

import {
  encodeAbiParameters,
  encodePacked,
  getContractAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { NATIVE_PEX, type Token } from "../config/tokens";

export const LANE_SOLIDITY = 0;
export const LANE_RUST = 1;
export const LANE_NATIVE = 2;

export interface Asset {
  lane: number;
  token: Address;
  id: bigint;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** The Asset a UI token maps to. PEX is pooled as PEX — no wrapper token. */
export function assetFor(t: Token): Asset {
  if (t.lane === "rust") return { lane: LANE_RUST, token: ZERO, id: BigInt(t.id ?? 0) };
  if (t.address === NATIVE_PEX.address) return { lane: LANE_NATIVE, token: ZERO, id: 0n };
  return { lane: LANE_SOLIDITY, token: t.address, id: 0n };
}

/** AssetLib.key() — the pair's ordering/identity for a side. */
export function assetKey(a: Asset): Hex {
  if (a.lane === LANE_RUST) return keccak256(encodePacked(["uint8", "uint64"], [1, a.id]));
  if (a.lane === LANE_NATIVE) return keccak256(encodePacked(["uint8"], [2]));
  return keccak256(encodePacked(["uint8", "address"], [0, a.token]));
}

/** True when `a` is token0 of the (a, b) pair — the pair sorts by key. */
export function isFirst(a: Asset, b: Asset): boolean {
  return BigInt(assetKey(a)) < BigInt(assetKey(b));
}

export function sameAsset(a: Asset, b: Asset): boolean {
  if (a.lane !== b.lane) return false;
  if (a.lane === LANE_RUST) return a.id === b.id;
  if (a.lane === LANE_NATIVE) return true;
  return a.token.toLowerCase() === b.token.toLowerCase();
}

/** Tuple form viem needs for a `struct Asset` argument. */
export const assetArg = (a: Asset) => ({ lane: a.lane, token: a.token, id: a.id }) as const;

/** LifeloxDualFactory.pairHash — the CREATE2 salt, sorted and abi-encoded. */
export function pairHash(a: Asset, b: Asset): Hex {
  const [x, y] = isFirst(a, b) ? [a, b] : [b, a];
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint8" },
        { type: "address" },
        { type: "uint64" },
        { type: "uint8" },
        { type: "address" },
        { type: "uint64" },
      ],
      [x.lane, x.token, x.id, y.lane, y.token, y.id]
    )
  );
}

/**
 * Where the pair for (a, b) lives — even before it is deployed.
 *
 * This matters for a Rust side: the tokens have to be pushed to the pair address
 * *before* the router can measure them, and pushing is a plain transfer that
 * cannot create anything. Predicting the CREATE2 address lets the push happen
 * first and the router create the pair in the same call that mints, saving the
 * user a whole transaction.
 */
export function predictPair(factory: Address, initCodeHash: Hex, a: Asset, b: Asset): Address {
  return getContractAddress({
    opcode: "CREATE2",
    from: factory,
    salt: pairHash(a, b),
    bytecodeHash: initCodeHash,
  });
}
