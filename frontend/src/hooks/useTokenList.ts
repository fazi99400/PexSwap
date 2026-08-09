import { useSyncExternalStore } from "react";
import { DEFAULT_TOKENS, Token } from "../config/tokens";

// User-imported tokens (by address) persist in localStorage and are shared
// across every token picker in the app via a tiny external store.

const KEY = "lifelox-imported-tokens";

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

function load(): Token[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Token[]) : [];
  } catch {
    return [];
  }
}

let imported: Token[] = load();
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((f) => f());

function subscribe(f: () => void) {
  subscribers.add(f);
  return () => {
    subscribers.delete(f);
  };
}

export function addImportedToken(t: Token) {
  const exists = imported.some((x) => x.address.toLowerCase() === t.address.toLowerCase());
  const isDefault = DEFAULT_TOKENS.some((x) => x.address.toLowerCase() === t.address.toLowerCase());
  if (exists || isDefault) return;
  imported = [...imported, t];
  localStorage.setItem(KEY, JSON.stringify(imported));
  emit();
}

export function removeImportedToken(address: string) {
  imported = imported.filter((x) => x.address.toLowerCase() !== address.toLowerCase());
  localStorage.setItem(KEY, JSON.stringify(imported));
  emit();
}

/** All selectable tokens: built-in defaults + anything the user imported. */
export function useTokenList(): { tokens: Token[]; imported: Token[]; importToken: (t: Token) => void } {
  const importedTokens = useSyncExternalStore(subscribe, () => imported, () => imported);
  return {
    tokens: [...DEFAULT_TOKENS, ...importedTokens],
    imported: importedTokens,
    importToken: addImportedToken,
  };
}
