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
  bytesToBigInt,
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

// A token's name/symbol/decimals live in RUSTVM storage at meta_slot(kind, id) =
// keccak256(0x4D | kind | id_be). Reading them straight from storage (rather than
// via the bridge precompile) is what survives the multi-shard public router: a
// getStorageAt from a shard that does not hold the token comes back as a zero
// word and the router skips it for the shard that has the real value, whereas a
// bridge eth_call returns a zero word from EVERY shard and the router cannot tell
// which one is real — so the bridge read silently comes back blank off-chain.
const META_TAG = 0x4d;
const META_DECIMALS = 1;
const META_SYMBOL = 2;
const META_NAME = 3;

/** keccak256(0x4D | kind | id_be) — RUSTVM storage slot for a metadata word. */
export function metaSlot(kind: number, id: bigint): Hex {
  return keccak256(concatBytes([Uint8Array.of(META_TAG, kind & 0xff), u64be(id)]));
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

const clean = (text: string) => text.replace(/[\u0000-\u001f\u007f\ufffd]/g, "").trim();
const utf8 = (bytes: Uint8Array) => {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
};

/**
 * Decode a metadata word into a string. The documented shape is a right-padded
 * utf-8 `bytes32` ("PXG\0\0…"), but a node may answer an ABI-encoded dynamic
 * `string` (offset | length | data) instead — decoding that as bytes32 would read
 * the 0x20 offset word and come back empty, so both shapes are handled here.
 */
export function bytes32ToString(word?: Hex): string {
  if (!word || word === "0x") return "";
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(word);
  } catch {
    return "";
  }

  // ABI-encoded string: 32-byte offset (0x20), 32-byte length, then the data.
  if (bytes.length >= 64 && Number(bytesToBigInt(bytes.slice(0, 32))) === 32) {
    const len = Number(bytesToBigInt(bytes.slice(32, 64)));
    if (len === 0) return "";
    if (len <= bytes.length - 64) return clean(utf8(bytes.slice(64, 64 + len)));
  }

  // bytes32 (or any raw run of utf-8 bytes): the string ends at the first zero.
  const end = bytes.indexOf(0);
  return clean(utf8(bytes.slice(0, end === -1 ? bytes.length : end)));
}

export interface RustMeta {
  symbol: string;
  name: string;
  decimals: number;
  /** True when the chain actually returned a symbol or name for this id. */
  hasMetadata: boolean;
  /** Which account answered — useful when debugging a chain without a bridge. */
  source?: Address;
}

/** Calldata for a metadata read: selector(1) | id(8 BE). */
export const encodeMetaRead = (op: number, id: bigint): Hex =>
  bytesToHex(concatBytes([Uint8Array.of(op & 0xff), u64be(id)]));

const readAt = async (client: RustReader, to: Address, op: number, id: bigint): Promise<Hex | undefined> => {
  try {
    const res = await client.call({ to, data: encodeMetaRead(op, id) });
    return res?.data && res.data !== "0x" ? res.data : undefined;
  } catch {
    // No such precompile on this RPC / no metadata for this id.
    return undefined;
  }
};

const toDecimals = (word?: Hex): number => {
  if (!word || word === "0x") return 0;
  try {
    const d = Number(BigInt(word));
    return Number.isFinite(d) && d >= 0 && d <= 36 ? d : 0;
  } catch {
    return 0;
  }
};

/**
 * Read name + symbol + decimals of a rust token id.
 *
 * The bridge precompile is the documented source. Some pexli builds answer the
 * same selectors on the RUSTVM account itself, so if the bridge says nothing we
 * ask RUSTVM before giving up — one extra eth_call, and the difference between a
 * real ticker and a "PXC #id" placeholder on a chain without the bridge.
 */
export async function fetchRustMeta(client: RustReader, id: bigint): Promise<RustMeta> {
  // Primary: read the metadata words straight from RUSTVM storage. This is the
  // path that resolves correctly through the multi-shard public router (see the
  // note on metaSlot) — the bridge eth_call below returns blank off-chain when
  // the token does not live on the router's first-answering shard.
  const readSlot = async (kind: number): Promise<Hex | undefined> => {
    try {
      const w = await client.getStorageAt({ address: RUSTVM_ADDRESS, slot: metaSlot(kind, id) });
      return w && w !== "0x" ? w : undefined;
    } catch {
      return undefined;
    }
  };
  const [symW, nameW, decW] = await Promise.all([
    readSlot(META_SYMBOL),
    readSlot(META_NAME),
    readSlot(META_DECIMALS),
  ]);
  const sSym = bytes32ToString(symW);
  const sName = bytes32ToString(nameW);
  const sDec = toDecimals(decW);
  if (sSym || sName || sDec) {
    return { symbol: sSym, name: sName, decimals: sDec, hasMetadata: !!sSym || !!sName, source: RUSTVM_ADDRESS };
  }

  // Fallback: the bridge precompile (single-shard chains / older nodes).
  for (const source of [PXC_BRIDGE_ADDRESS, RUSTVM_ADDRESS] as const) {
    const [symWord, nameWord, decWord] = await Promise.all([
      readAt(client, source, OP_SYMBOL, id),
      readAt(client, source, OP_NAME, id),
      readAt(client, source, OP_DECIMALS, id),
    ]);
    const symbol = bytes32ToString(symWord);
    const name = bytes32ToString(nameWord);
    const decimals = toDecimals(decWord);
    if (symbol || name || decimals) {
      return { symbol, name, decimals, hasMetadata: !!symbol || !!name, source };
    }
  }
  return { symbol: "", name: "", decimals: 0, hasMetadata: false };
}

/** A holder's balance of a rust token, straight from the RUSTVM balance slot. */
export async function fetchRustBalance(
  client: RustReader,
  id: bigint,
  holder: Address,
  ns: number = NS_PXC20
): Promise<bigint> {
  try {
    const raw = await client.getStorageAt({ address: RUSTVM_ADDRESS, slot: balanceSlot(ns, id, holder) });
    return raw && raw !== "0x" ? BigInt(raw) : 0n;
  } catch {
    return 0n;
  }
}

/** Rust-lane PXC-20 transfer opcode — a push by the holder (there is no approve). */
export const OP_XFER_20 = 0x21;
export const U64_MAX = 2n ** 64n - 1n;

/**
 * Calldata for "send `amount` of rust token `id` to `to`": op(1) | id(8) | to(20)
 * | amount(8 BE), sent as a plain transaction to the RUSTVM account. This is how
 * a Rust side is funded into a pair before calling the cross-lane router.
 */
export function encodeRustTransfer(id: bigint, to: Address, amount: bigint): Hex {
  if (amount < 0n || amount > U64_MAX) throw new Error("rust amounts are u64");
  return bytesToHex(
    concatBytes([Uint8Array.of(OP_XFER_20), u64be(id), toBytes(pad(to, { size: 20 })), u64be(amount)])
  );
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
