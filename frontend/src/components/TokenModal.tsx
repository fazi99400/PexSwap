import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { useReadContracts } from "wagmi";
import { Token } from "../config/tokens";
import { ERC20_ABI } from "../config/abis";
import { colorForAddress } from "../hooks/useTokenList";
import { TokenIcon, LaneMark, IconClose } from "./Icons";

export function TokenModal({
  tokens,
  onSelect,
  onClose,
  onImport,
}: {
  tokens: Token[];
  onSelect: (t: Token) => void;
  onClose: () => void;
  /** Called when the user imports a new token by address. */
  onImport?: (t: Token) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const queryIsAddress = isAddress(q);
  const alreadyListed =
    queryIsAddress && tokens.some((t) => t.address.toLowerCase() === q.toLowerCase());

  // Read metadata for a pasted address that isn't in the list yet.
  const { data: meta, isLoading } = useReadContracts({
    contracts: [
      { address: q as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" },
      { address: q as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" },
      { address: q as `0x${string}`, abi: ERC20_ABI, functionName: "name" },
    ],
    query: { enabled: queryIsAddress && !alreadyListed },
  });

  const candidate: Token | undefined = useMemo(() => {
    if (!queryIsAddress || alreadyListed || !meta) return undefined;
    const symbol = meta[0]?.result as string | undefined;
    const decimals = meta[1]?.result as number | undefined;
    const name = (meta[2]?.result as string | undefined) ?? symbol;
    if (!symbol || decimals === undefined) return undefined;
    return {
      address: q as `0x${string}`,
      symbol,
      name: name ?? symbol,
      decimals,
      lane: "solidity",
      color: colorForAddress(q),
    };
  }, [queryIsAddress, alreadyListed, meta, q]);

  const filtered = useMemo(() => {
    if (!q) return tokens;
    const lower = q.toLowerCase();
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(lower) ||
        t.name.toLowerCase().includes(lower) ||
        t.address.toLowerCase() === lower
    );
  }, [q, tokens]);

  function choose(t: Token, isNew = false) {
    if (isNew) onImport?.(t);
    onSelect(t);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-title">
          <h2>Select a token</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>

        <input
          className="token-search"
          placeholder="Search name or paste token address (0x…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoFocus
        />

        <div className="token-scroll">
          {/* Import row for a pasted, unlisted address */}
          {queryIsAddress && !alreadyListed && (
            <>
              {isLoading && <div className="subtle import-hint">Looking up token…</div>}
              {candidate && (
                <div className="token-row import-row">
                  <TokenIcon token={candidate} size={34} />
                  <div style={{ flex: 1 }}>
                    <div className="sym">
                      {candidate.symbol}
                      <span className="lane-badge lane-solidity">
                        <LaneMark lane="solidity" /> imported
                      </span>
                    </div>
                    <div className="nm">{candidate.name}</div>
                  </div>
                  <button className="btn btn-primary import-btn" onClick={() => choose(candidate, true)}>
                    Import
                  </button>
                </div>
              )}
              {!isLoading && !candidate && (
                <div className="subtle import-hint">No PXC-20 token found at that address on Pexli.</div>
              )}
            </>
          )}

          {filtered.map((t) => (
            <div key={`${t.symbol}-${t.address}`} className="token-row" onClick={() => choose(t)}>
              <TokenIcon token={t} size={34} />
              <div style={{ flex: 1 }}>
                <div className="sym">
                  {t.symbol}
                  <span className={`lane-badge lane-${t.lane}`}>
                    <LaneMark lane={t.lane} /> {t.lane}
                  </span>
                </div>
                <div className="nm">{t.name}</div>
              </div>
            </div>
          ))}

          {!filtered.length && !queryIsAddress && (
            <div className="subtle import-hint">No match. Paste a token address to import it.</div>
          )}
        </div>

        <div className="subtle modal-note">
          Anyone can import a PXC-20 token by address and pair it with PEX in the Pool tab.
        </div>
      </div>
    </div>
  );
}
