// Rust (SVM) lane token lookup — the SAME method the Lifelox wallet uses
// (wallet/src/core/rustvm.ts). Rust-lane tokens have NO 0x contract: they are
// keyed by a numeric id, and their state lives in the RUSTVM system account's
// storage, read over the normal eth_* RPC.
//
//   admin slot (existence): keccak256( 0xAD | ns(1) | id(8 BE) )   -> non-zero = minted
//   balance slot:           keccak256( ns(1)       | id(8 BE) | holder(20) )
//
// Their name/symbol/decimals are NOT in that storage — they are read through the
// Rust-lane bridge precompile at 0x…0e13, the same one LifeloxDualPair uses:
//
//   eth_call 0x…0e13, data = 0x01 | id(8 BE)  -> decimals (uint256)
//                            0x02 | id(8 BE)  -> symbol   (bytes32, utf-8, right-padded)
//                            0x03 | id(8 BE)  -> name     (bytes32)
//
// So a rust id now resolves to a real ticker exactly like a 0x address resolves
// through ERC-20 name()/symbol()/decimals(). Metadata is optional on this chain:
// when it is absent the reads come back empty and we fall back to "PXC #id" —
// an empty symbol is never rendered as if it were real.

import {
  keccak256,
  concatBytes,
  numberToBytes,
  bytesToHex,
  hexToBytes,
  toBytes,
  pad,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import { colorForAddress, type Token } from "../config/tokens";

export const RUSTVM_ADDRESS = "0x0000000000000000000000000000000000000e12" as const;
/** Rust-lane bridge precompile — metadata + balance reads, PXC transfers. */
export const PXC_BRIDGE_ADDRESS = "0x0000000000000000000000000000000000000e13" as const;

export const NS_PXC20 = 0x20;
export const NS_PXC1155 = 0x11;

/** Bridge read selectors (single byte, followed by the 8-byte id). */
const OP_DECIMALS = 0x01;
const OP_SYMBOL = 0x02;
const OP_NAME = 0x03;

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

/** A rust token has no real contract; the UI keys it by its id encoded as an
 *  address so it stays unique and de-dupes cleanly against 0x tokens. */
export const rustKey = (id: bigint): Address =>
  getAddress(("0x" + id.toString(16).padStart(40, "0")) as Address);

/** Inverse of {@link rustKey} — the numeric id behind a synthetic rust address. */
export const rustIdFromKey = (key: string): bigint => BigInt(key);

/** Minimal client surface we need — satisfied by viem's PublicClient. */
export interface RustReader {
  call(args: { to: Address; data: Hex }): Promise<{ data?: Hex }>;
  getStorageAt(args: { address: Address; slot: Hex }): Promise<Hex | undefined>;
}

/** Decode a right-padded utf-8 bytes32 word ("PXG\0\0…") into a clean string. */
export function bytes32ToString(word?: Hex): string {
  if (!word || word === "0x") return "";
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(word);
  } catch {
    return "";
  }
  // The word is right-padded with zero bytes; the string ends at the first one.
  const end = bytes.indexOf(0);
  const slice = bytes.slice(0, end === -1 ? bytes.length : end);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } catch {
    return "";
  }
  // Drop control characters / replacement chars a half-written slot could carry.
  return text.replace(/[\u0000-\u001f\u007f\ufffd]/g, "").trim();
}

export interface RustMeta {
  symbol: string;
  name: string;
  decimals: number;
  /** True when the bridge actually returned a symbol or name for this id. */
  hasMetadata: boolean;
}

const bridgeCall = async (client: RustReader, op: number, id: bigint): Promise<Hex | undefined> => {
  try {
    const res = await client.call({
      to: PXC_BRIDGE_ADDRESS,
      data: bytesToHex(concatBytes([Uint8Array.of(op), u64be(id)])),
    });
    return res?.data;
  } catch {
    // No bridge on this RPC / no metadata for this id — treated as "unknown".
    return undefined;
  }
};

/** Read name + symbol + decimals of a rust token id through the bridge. */
export async function fetchRustMeta(client: RustReader, id: bigint): Promise<RustMeta> {
  const [symWord, nameWord, decWord] = await Promise.all([
    bridgeCall(client, OP_SYMBOL, id),
    bridgeCall(client, OP_NAME, id),
    bridgeCall(client, OP_DECIMALS, id),
  ]);

  const symbol = bytes32ToString(symWord);
  const name = bytes32ToString(nameWord);
  let decimals = 0;
  if (decWord && decWord !== "0x") {
    try {
      const d = Number(BigInt(decWord));
      if (Number.isFinite(d) && d >= 0 && d <= 36) decimals = d;
    } catch {
      decimals = 0;
    }
  }

  return { symbol, name, decimals, hasMetadata: !!symbol || !!name };
}

export interface RustTokenInfo extends RustMeta {
  id: bigint;
  /** Namespace the id was found in, when the admin slot proved it exists. */
  ns?: number;
  nsLabel?: string;
}

/** Which namespace (if any) has this id minted — the wallet's existence proof. */
export async function findRustNamespace(
  client: RustReader,
  id: bigint
): Promise<{ ns: number; label: string } | null> {
  for (const { ns, label } of RUST_NAMESPACES) {
    try {
      const word = await client.getStorageAt({ address: RUSTVM_ADDRESS, slot: adminSlot(ns, id) });
      if (word && word !== "0x" && BigInt(word) !== 0n) return { ns, label };
    } catch {
      // RPC hiccup on one namespace shouldn't hide the other.
    }
  }
  return null;
}

/**
 * Resolve a rust id to real token metadata, the way a 0x address resolves through
 * ERC-20. Returns null when the id is not minted and the bridge knows nothing
 * about it — i.e. there is no such token to import.
 */
export async function detectRustToken(client: RustReader, id: bigint): Promise<RustTokenInfo | null> {
  const [found, meta] = await Promise.all([findRustNamespace(client, id), fetchRustMeta(client, id)]);
  // Either proof is enough: the admin slot (minted) or live metadata on the bridge.
  if (!found && !meta.hasMetadata && meta.decimals === 0) return null;
  return { ...meta, id, ns: found?.ns, nsLabel: found?.label };
}

/** Build the UI token for a rust id, falling back to "PXC #id" without metadata. */
export function rustTokenFrom(info: RustTokenInfo): Token {
  const address = rustKey(info.id);
  const label = info.nsLabel ?? "PXC-20";
  return {
    address,
    symbol: info.symbol || `PXC #${info.id}`,
    name: info.name || `Rust ${label} #${info.id}`,
    decimals: info.decimals,
    lane: "rust",
    id: Number(info.id),
    color: colorForAddress(address),
  };
}
