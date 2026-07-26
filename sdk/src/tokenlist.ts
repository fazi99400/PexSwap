// Shared token-list schema used by BOTH the Lifelox wallet and the DEX.

export type Lane = "solidity" | "rust";
export type Standard = "PXC-20" | "PXC-1155" | "native";

export interface TokenEntry {
  /** Display symbol, e.g. "USDP". */
  symbol: string;
  /** Human name. */
  name: string;
  /** Which VM lane the token lives in. */
  lane: Lane;
  /** Token standard. */
  standard: Standard;
  /** Solidity-lane / native: the 0x contract (or 0x0 for native). */
  address?: `0x${string}`;
  /** Rust-lane: the numeric token id in RUSTVM storage. */
  id?: number;
  decimals: number;
  /** Optional gradient for the coin icon. */
  color?: [string, string];
}

export interface TokenList {
  name: string;
  chainId: number;
  version: { major: number; minor: number; patch: number };
  tokens: TokenEntry[];
}

export const isRust = (t: TokenEntry): boolean => t.lane === "rust";
export const isNative = (t: TokenEntry): boolean => t.standard === "native";

/** Validate a token list against the schema. Throws on the first problem. */
export function validateTokenList(list: TokenList): void {
  if (!list.tokens?.length) throw new Error("token list has no tokens");
  for (const t of list.tokens) {
    if (!t.symbol || typeof t.decimals !== "number") throw new Error(`bad token entry: ${JSON.stringify(t)}`);
    if (t.lane === "rust" && typeof t.id !== "number")
      throw new Error(`rust-lane token ${t.symbol} must have a numeric id`);
    if (t.lane === "solidity" && !t.address)
      throw new Error(`solidity-lane token ${t.symbol} must have an address`);
  }
}
