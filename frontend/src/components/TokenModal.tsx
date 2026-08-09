import { useMemo, useState } from "react";
import { isAddress, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { Token } from "../config/tokens";
import { ERC20_ABI } from "../config/abis";
import { colorForAddress } from "../hooks/useTokenList";
import { isRustId, rustIdToAddress } from "../lib/rustId";
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
  /** Called when the user imports a new token by address or rust id. */
  onImport?: (t: Token) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();

  // Solidity token = 0x address; Rust token = numeric id (mapped to its address).
  const rustMode = isRustId(q);
  const lookupAddr: Address | undefined = isAddress(q)
    ? (q as Address)
    : rustMode
    ? rustIdToAddress(BigInt(q))
    : undefined;

  const alreadyListed =
    !!lookupAddr && tokens.some((t) => t.address.toLowerCase() === lookupAddr.toLowerCase());

  // Read metadata (works for both lanes — PXC-20 exposes the ERC-20 ABI on the EVM).
  const { data: meta, isLoading } = useReadContracts({
    contracts: [
      { address: lookupAddr, abi: ERC20_ABI, functionName: "symbol" },
      { address: lookupAddr, abi: ERC20_ABI, functionName: "decimals" },
      { address: lookupAddr, abi: ERC20_ABI, functionName: "name" },
    ],
    query: { enabled: !!lookupAddr && !alreadyListed },
  });

  const candidate: Token | undefined = useMemo(() => {
    if (!lookupAddr || alreadyListed || !meta) return undefined;
    const symbol = meta[0]?.result as string | undefined;
    const decimals = meta[1]?.result as number | undefined;
    const name = (meta[2]?.result as string | undefined) ?? symbol;
    if (!symbol || decimals === undefined) return undefined;
    return {
      address: lookupAddr,
      symbol,
      name: name ?? symbol,
      decimals,
      lane: rustMode ? "rust" : "solidity",
      id: rustMode ? Number(q) : undefined,
      color: colorForAddress(lookupAddr),
    };
  }, [lookupAddr, alreadyListed, meta, q, rustMode]);

  const searching = isAddress(q) || rustMode;

  const filtered = useMemo(() => {
    if (!q || searching) return tokens;
    const lower = q.toLowerCase();
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(lower) ||
        t.name.toLowerCase().includes(lower) ||
        t.address.toLowerCase() === lower
    );
  }, [q, tokens, searching]);

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
          placeholder="Search, paste 0x address (Solidity), or type a rust id (number)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoFocus
        />

        <div className="token-scroll">
          {searching && !alreadyListed && (
            <>
              {isLoading && <div className="subtle import-hint">Looking up token…</div>}
              {candidate && (
                <div className="token-row import-row">
                  <TokenIcon token={candidate} size={34} />
                  <div style={{ flex: 1 }}>
                    <div className="sym">
                      {candidate.symbol}
                      <span className={`lane-badge lane-${candidate.lane}`}>
                        <LaneMark lane={candidate.lane} /> {rustMode ? `rust · id ${q}` : "imported"}
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
                <div className="subtle import-hint">
                  {rustMode
                    ? `No PXC-20 token found for rust id ${q}.`
                    : "No PXC-20 token found at that address on Pexli."}
                </div>
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

          {!filtered.length && !searching && (
            <div className="subtle import-hint">No match. Paste an address or a rust id to import.</div>
          )}
        </div>

        <div className="subtle modal-note">
          Solidity token = 0x address · Rust token = numeric id. Both are PXC-20 and pair with PEX.
        </div>
      </div>
    </div>
  );
}
