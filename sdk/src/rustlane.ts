// Rust-lane PXC token support.
//
// Rust-lane tokens do NOT have their own ERC-20 contract. Their state lives in
// the RUSTVM system account's storage, keyed by a numeric token `id`. This
// module implements the exact storage-key derivation and operation calldata
// layout documented by pexli-stf, so the wallet can read balances and build
// transfer/settlement transactions.
//
// Storage key (balance):  keccak256( ns(1) || id(8, big-endian) || holder(20) )
// Operation calldata:     op(1) || id(8, big-endian) || to(20) || amount(8, big-endian)

import {
  keccak256,
  concatBytes,
  bytesToHex,
  toBytes,
  pad,
  numberToBytes,
  hexToBigInt,
  type Hex,
  type Address,
} from "viem";
import { NS, OP, RUSTVM_ADDRESS, type Ns } from "./constants.js";

/** 8-byte big-endian encoding of a token id or amount (u64). */
export function u64be(value: bigint | number): Uint8Array {
  const v = BigInt(value);
  if (v < 0n || v > 0xffffffffffffffffn) throw new Error("u64be: out of range");
  return numberToBytes(v, { size: 8 });
}

/** 20-byte address encoding. */
function addr20(a: Address): Uint8Array {
  return toBytes(pad(a, { size: 20 }));
}

/**
 * Storage slot for a holder's balance of Rust-lane token `id` in namespace `ns`.
 * = keccak256( ns(1) || id_be8 || holder20 )
 */
export function rustBalanceSlot(id: bigint | number, holder: Address, ns: Ns = NS.PXC20): Hex {
  const preimage = concatBytes([Uint8Array.of(ns), u64be(id), addr20(holder)]);
  return keccak256(preimage);
}

/**
 * Calldata for a Rust-lane operation.
 * = op(1) || id_be8 || to20 || amount_be8   (37 bytes)
 */
export function encodeRustOp(op: number, id: bigint | number, to: Address, amount: bigint | number): Hex {
  return bytesToHex(concatBytes([Uint8Array.of(op & 0xff), u64be(id), addr20(to), u64be(amount)]));
}

/** Convenience: calldata for a PXC-20 transfer (op XFER_20). */
export function encodePxc20Transfer(id: bigint | number, to: Address, amount: bigint | number): Hex {
  return encodeRustOp(OP.XFER_20, id, to, amount);
}

/** Minimal shape of a viem/EIP-1193 client we need for reads. */
export interface StorageReader {
  getStorageAt(args: { address: Address; slot: Hex }): Promise<Hex | undefined>;
}

/** Read a Rust-lane token balance via eth_getStorageAt on the RUSTVM account. */
export async function rustBalanceOf(
  client: StorageReader,
  id: bigint | number,
  holder: Address,
  ns: Ns = NS.PXC20,
  rustvm: Address = RUSTVM_ADDRESS
): Promise<bigint> {
  const slot = rustBalanceSlot(id, holder, ns);
  const raw = await client.getStorageAt({ address: rustvm, slot });
  if (!raw || raw === "0x") return 0n;
  return hexToBigInt(raw);
}

/**
 * Build an unsigned transaction that performs a Rust-lane PXC-20 transfer.
 * The wallet signs and sends this (EIP-1193 eth_sendTransaction).
 */
export function buildRustTransferTx(
  id: bigint | number,
  to: Address,
  amount: bigint | number,
  rustvm: Address = RUSTVM_ADDRESS
): { to: Address; data: Hex; value: Hex } {
  return { to: rustvm, data: encodePxc20Transfer(id, to, amount), value: "0x0" };
}
