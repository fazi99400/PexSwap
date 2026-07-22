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
  logo?: string;
}

export const NATIVE_PEX: Token = {
  address: "0x0000000000000000000000000000000000000000",
  symbol: "PEX",
  name: "Pexli",
  decimals: 18,
  lane: "solidity",
  logo: "🟠",
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
    logo: "🟠",
  },
  {
    address: (import.meta.env.VITE_TOKEN_USDP ??
      "0x0000000000000000000000000000000000000001") as `0x${string}`,
    symbol: "USDP",
    name: "Pexli USD",
    decimals: 18,
    lane: "solidity",
    logo: "💵",
  },
  {
    address: (import.meta.env.VITE_TOKEN_PXLI ??
      "0x0000000000000000000000000000000000000002") as `0x${string}`,
    symbol: "PXLI",
    name: "Pexli Gold (Rust lane)",
    decimals: 18,
    lane: "rust",
    logo: "🦀",
  },
];
