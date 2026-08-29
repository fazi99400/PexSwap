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
  /** Rust-lane tokens are addressed by a numeric id; kept for reference. */
  id?: number;
  /** Gradient stops [from, to] used to render the coin's SVG icon. */
  color: [string, string];
}

// Deterministic icon gradient for any address/key, so a token that nobody has
// hand-listed still renders with a stable colour everywhere in the app.
const PALETTE: [string, string][] = [
  ["#FF9A3D", "#E85D00"],
  ["#4FE0A0", "#12A150"],
  ["#7AA2FF", "#3B5BDB"],
  ["#FFDE7A", "#E0A400"],
  ["#FF8FB1", "#E64980"],
  ["#8CE0D0", "#0CA678"],
];

export function colorForAddress(addr: string): [string, string] {
  let h = 0;
  for (const ch of addr.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
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

// Only PEX and tokens that actually exist on the current chain are listed. Any
// token with a live pool is discovered on-chain and added automatically (see
// usePools), so nothing needs to be hard-coded here — hard-coded addresses from
// a previous chain just render as dead entries after a network reset.
export const DEFAULT_TOKENS: Token[] = [NATIVE_PEX, WPEX, USDP, PXLI].filter(
  (t): t is Token => t !== null
);

/** A sensible non-PEX default for the "to" side of a swap, if one exists. */
export const SECOND_TOKEN: Token = DEFAULT_TOKENS[1] ?? NATIVE_PEX;
