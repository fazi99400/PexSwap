// Lifelox SDK — chain + Rust-lane constants.
//
// These MUST match the live pexli-stf `rustvm.rs`. They are centralized here so
// the wallet and the DEX read one source of truth. If the chain changes an
// opcode or the RUSTVM address, edit only this file.

/** Pexli network. */
export const PEXLI_CHAIN_ID = 78901;
export const NATIVE_SYMBOL = "PEX";
export const NATIVE_DECIMALS = 18;

/** The Lifelox wallet's EIP-6963 identity. */
export const LIFELOX_WALLET_RDNS = "xyz.lifelox.wallet";
export const LIFELOX_WALLET_NAME = "Lifelox";

/**
 * RUSTVM system address that holds all Rust-lane PXC token state.
 * Per the pexli-stf spec the address ends in ...0e12. Confirm against the
 * running chain before mainnet; override via LifeloxConfig if needed.
 */
export const RUSTVM_ADDRESS = "0x0000000000000000000000000000000000000e12" as const;

/**
 * Rust-lane bridge precompile. Rust token metadata (name/symbol/decimals) is NOT
 * in RUSTVM storage — it is read with `eth_call` against this address, which is
 * also what `LifeloxDualPair` uses on-chain (contracts/dual/PxcBridge.sol).
 */
export const PXC_BRIDGE_ADDRESS = "0x0000000000000000000000000000000000000e13" as const;

/** Bridge read selectors (first calldata byte, followed by the 8-byte id). */
export const BRIDGE = {
  DECIMALS: 0x01,
  SYMBOL: 0x02,
  NAME: 0x03,
  BALANCE_20: 0x20,
} as const;

/** PXC namespaces (first storage-key byte). */
export const NS = {
  PXC20: 0x20,
  PXC1155: 0x11,
} as const;

/**
 * RUSTVM operation opcodes (first calldata byte).
 * XFER_20 is specified by pexli-stf; add the rest here as the chain defines
 * them (keep them verified against rustvm.rs — do not guess).
 */
export const OP = {
  XFER_20: 0x21,
} as const;

export type Ns = (typeof NS)[keyof typeof NS];
export type Op = (typeof OP)[keyof typeof OP];
