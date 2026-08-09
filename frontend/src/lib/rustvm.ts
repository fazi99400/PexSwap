// Rust (SVM) lane token lookup — the SAME method the Lifelox wallet uses
// (wallet/src/core/rustvm.ts). Rust-lane tokens have NO 0x contract and NO
// on-chain name/symbol: they are keyed by a numeric id, and their state lives in
// the RUSTVM system account's storage, read over the normal eth_* RPC.
//
//   admin slot (existence): keccak256( 0xAD | ns(1) | id(8 BE) )   -> non-zero = minted
//   balance slot:           keccak256( ns(1)       | id(8 BE) | holder(20) )

import { keccak256, concatBytes, numberToBytes, toBytes, pad, type Address, type Hex } from "viem";

export const RUSTVM_ADDRESS = "0x0000000000000000000000000000000000000e12" as const;
export const NS_PXC20 = 0x20;
export const NS_PXC1155 = 0x11;

export function isRustId(input: string): boolean {
  return /^[0-9]+$/.test(input.trim());
}

const u64be = (v: bigint) => numberToBytes(v, { size: 8 });

/** keccak256(0xAD | ns | id) — non-zero storage word proves the id exists. */
export function adminSlot(ns: number, id: bigint): Hex {
  return keccak256(concatBytes([Uint8Array.of(0xad, ns), u64be(id)]));
}

/** keccak256(ns | id | holder) — a holder's balance of this rust token. */
export function balanceSlot(ns: number, id: bigint, holder: Address): Hex {
  return keccak256(concatBytes([Uint8Array.of(ns), u64be(id), toBytes(pad(holder, { size: 20 }))]));
}

export const RUST_NAMESPACES: { ns: number; label: string }[] = [
  { ns: NS_PXC20, label: "PXC-20" },
  { ns: NS_PXC1155, label: "PXC-1155" },
];
