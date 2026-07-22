// PexSwap default token list. `lane` records whether a token's contract lives
// on the Solidity (EVM) or Rust (SBF) side — both trade through the same UI
// because pexli-v2 fuses them into one block with shared state.

export type Lane = "solidity" | "rust";

export interface Token {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  lane: Lane;
  /** Gradient stops [from, to] used to render the coin's SVG icon. */
  color: [string, string];
}

export const NATIVE_PEX: Token = {
  address: "0x0000000000000000000000000000000000000000",
  symbol: "PEX",
  name: "Pexli",
  decimals: 18,
  lane: "solidity",
  color: ["#FFB35C", "#FF6A00"],
};

// Populate with your deployed test tokens (see deploy.js output).
export const DEFAULT_TOKENS: Token[] = [
  NATIVE_PEX,
  {
    address: (import.meta.env.VITE_WPEX ??
      "0x0000000000000000000000000000000000000000") as `0x${string}`,
    symbol: "WPEX",
    name: "Wrapped PEX",
    decimals: 18,
    lane: "solidity",
    color: ["#FFC27A", "#E85D00"],
  },
  {
    address: (import.meta.env.VITE_TOKEN_USDP ??
      "0x0000000000000000000000000000000000000001") as `0x${string}`,
    symbol: "USDP",
    name: "Pexli USD",
    decimals: 18,
    lane: "solidity",
    color: ["#4FE0A0", "#12A150"],
  },
  {
    address: (import.meta.env.VITE_TOKEN_PXLI ??
      "0x0000000000000000000000000000000000000002") as `0x${string}`,
    symbol: "PXLI",
    name: "Pexli Gold",
    decimals: 18,
    lane: "rust",
    color: ["#FFDE7A", "#E0A400"],
  },
];
