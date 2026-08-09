// Lifelox default token list. Only tokens that actually exist on-chain are shown:
// PEX (native) is always here; WPEX and any demo tokens appear only when their
// address is provided via env (i.e. after they were really deployed). Everyone
// else brings their own token with "Import by address".

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

const isReal = (a?: string): a is `0x${string}` =>
  !!a && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0+$/.test(a);

function envToken(
  addr: string | undefined,
  meta: Omit<Token, "address">
): Token | null {
  return isReal(addr) ? { address: addr, ...meta } : null;
}

// WPEX is part of the DEX core, so it shows as soon as VITE_WPEX is set.
const WPEX = envToken(import.meta.env.VITE_WPEX, {
  symbol: "WPEX",
  name: "Wrapped PEX",
  decimals: 18,
  lane: "solidity",
  color: ["#FFC27A", "#E85D00"],
});

// Optional demo tokens — only present if you deployed them (DEMO=1) and set the env.
const USDP = envToken(import.meta.env.VITE_TOKEN_USDP, {
  symbol: "USDP",
  name: "Pexli USD",
  decimals: 18,
  lane: "solidity",
  color: ["#4FE0A0", "#12A150"],
});
const PXLI = envToken(import.meta.env.VITE_TOKEN_PXLI, {
  symbol: "PXLI",
  name: "Pexli Gold",
  decimals: 18,
  lane: "solidity",
  color: ["#FFDE7A", "#E0A400"],
});

// Project tokens that should always be visible to EVERY visitor (not just the
// person who imported them). Added here so they ship in the app bundle.
const MAIN_TOKENS: Token[] = [
  {
    address: "0xb95DAf22103204ba261258D9613353E96f3343b1",
    symbol: "TGold",
    name: "Test Gold",
    decimals: 14,
    lane: "solidity",
    color: ["#FFDE7A", "#E0A400"],
  },
  {
    address: "0x3092c4a14e6d4E66B3c708276a4a121ef7658609",
    symbol: "TK1",
    name: "Token 1",
    decimals: 12,
    lane: "solidity",
    color: ["#7AA2FF", "#3B5BDB"],
  },
  {
    address: "0x08915D4D3D313ABA6673db45F050D1bcCA53745b",
    symbol: "TUS",
    name: "Test USD",
    decimals: 18,
    lane: "solidity",
    color: ["#4FE0A0", "#12A150"],
  },
];

export const DEFAULT_TOKENS: Token[] = [NATIVE_PEX, WPEX, USDP, PXLI, ...MAIN_TOKENS].filter(
  (t): t is Token => t !== null
);

/** A sensible non-PEX default for the "to" side of a swap, if one exists. */
export const SECOND_TOKEN: Token = DEFAULT_TOKENS[1] ?? NATIVE_PEX;
