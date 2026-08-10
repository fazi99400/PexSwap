import { useSyncExternalStore } from "react";
import { colorForAddress, DEFAULT_TOKENS, Token } from "../config/tokens";

// Two sources of non-default tokens feed every token picker in the app:
//
//  - imported : tokens THIS browser imported by address / rust id. Persisted in
//               localStorage, private to this visitor.
//  - discovered : tokens read off the chain because a pool exists for them. These
//               are global — the factory is the source of truth, so a pool anyone
//               creates shows up for every visitor with its real name/symbol, with
//               nothing to import and nothing stored locally.

const KEY = "lifelox-imported-tokens";

export { colorForAddress };

function load(): Token[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Token[]) : [];
  } catch {
    return [];
  }
}

let imported: Token[] = load();
let discovered: Token[] = [];
// useSyncExternalStore needs a snapshot that only changes when the data does.
let snapshot = { imported, discovered };

const subscribers = new Set<() => void>();
function publish() {
  snapshot = { imported, discovered };
  subscribers.forEach((f) => f());
}

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
  publish();
}

export function removeImportedToken(address: string) {
  imported = imported.filter((x) => x.address.toLowerCase() !== address.toLowerCase());
  localStorage.setItem(KEY, JSON.stringify(imported));
  publish();
}

/**
 * Publish tokens found on-chain (pool sides hydrated by `usePools`) so every
 * picker and the Tokens table can show them. Not persisted: they are re-read
 * from the factory on each load, which is what makes them the same for everyone.
 * A no-op when nothing new arrived, so it is safe to call from an effect.
 */
export function registerDiscoveredTokens(list: Token[]) {
  const known = new Set(discovered.map((t) => t.address.toLowerCase()));
  const fresh = list.filter((t) => {
    const k = t.address.toLowerCase();
    if (known.has(k)) return false;
    known.add(k);
    return true;
  });
  if (!fresh.length) return;
  discovered = [...discovered, ...fresh];
  publish();
}

/** All selectable tokens: built-in defaults + every token that has a pool on the
 *  factory + anything this browser imported, de-duplicated by address (defaults
 *  win, so a token that later becomes a default no longer shows twice). */
export function useTokenList(): {
  tokens: Token[];
  imported: Token[];
  discovered: Token[];
  importToken: (t: Token) => void;
} {
  const { imported: importedTokens, discovered: discoveredTokens } = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot
  );
  const byAddress = new Map<string, Token>();
  for (const t of [...DEFAULT_TOKENS, ...discoveredTokens, ...importedTokens]) {
    const key = t.address.toLowerCase();
    if (!byAddress.has(key)) byAddress.set(key, t);
  }
  return {
    tokens: [...byAddress.values()],
    imported: importedTokens,
    discovered: discoveredTokens,
    importToken: addImportedToken,
  };
}
