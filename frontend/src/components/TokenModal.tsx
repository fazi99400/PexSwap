import { useMemo, useState } from "react";
import { isAddress, type Address } from "viem";
import { useReadContracts, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { colorForAddress, Token } from "../config/tokens";
import { ERC20_ABI } from "../config/abis";
import { isRustId, detectRustToken, rustTokenFrom, rustKey } from "../lib/rustvm";
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
  onImport?: (t: Token) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const publicClient = usePublicClient();

  const evmAddr: Address | undefined = isAddress(q) ? (q as Address) : undefined;
  const rustMode = isRustId(q);
  const rustId = rustMode ? BigInt(q) : undefined;
  const key = evmAddr ?? (rustId !== undefined ? rustKey(rustId) : undefined);
  const alreadyListed = !!key && tokens.some((t) => t.address.toLowerCase() === key.toLowerCase());

  // ---- Solidity path: read PXC-20 (ERC-20 ABI) metadata over eth_call ----
  const { data: meta, isLoading: evmLoading } = useReadContracts({
    contracts: [
      { address: evmAddr, abi: ERC20_ABI, functionName: "symbol" },
      { address: evmAddr, abi: ERC20_ABI, functionName: "decimals" },
      { address: evmAddr, abi: ERC20_ABI, functionName: "name" },
    ],
    query: { enabled: !!evmAddr && !alreadyListed },
  });

  // ---- Rust path: no 0x contract, so the id is proven from admin_slot at RUSTVM
  // and its name/symbol/decimals come off the bridge precompile — the rust-lane
  // equivalent of ERC-20 name()/symbol()/decimals(). ----
  const { data: rust, isLoading: rustLoading } = useQuery({
    queryKey: ["rust-detect", q],
    enabled: rustMode && !alreadyListed && !!publicClient,
    queryFn: () => detectRustToken(publicClient!, rustId!),
  });

  const candidate: Token | undefined = useMemo(() => {
    if (alreadyListed || !key) return undefined;
    if (evmAddr && meta) {
      const symbol = meta[0]?.result as string | undefined;
      const decimals = meta[1]?.result as number | undefined;
      const name = (meta[2]?.result as string | undefined) ?? symbol;
      if (!symbol || decimals === undefined) return undefined;
      return { address: evmAddr, symbol, name: name ?? symbol, decimals, lane: "solidity", color: colorForAddress(evmAddr) };
    }
    if (rustMode && rust) return rustTokenFrom(rust);
    return undefined;
  }, [alreadyListed, key, evmAddr, meta, rustMode, rust, q]);

  const searching = !!evmAddr || rustMode;
  const isLoading = evmLoading || rustLoading;

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
              {isLoading && <div className="subtle import-hint">Looking up token on-chain…</div>}
              {candidate && (
                <div className="token-row import-row">
                  <TokenIcon token={candidate} size={34} />
                  <div style={{ flex: 1 }}>
                    <div className="sym">
                      {candidate.symbol}
                      <span className={`lane-badge lane-${candidate.lane}`}>
                        <LaneMark lane={candidate.lane} /> {candidate.lane === "rust" ? `rust · id ${q}` : "imported"}
                      </span>
                    </div>
                    <div className="nm">{candidate.name}</div>
                    {candidate.lane === "rust" && rust && !rust.hasMetadata && (
                      <div className="subtle">
                        This id has no name/symbol on-chain, so it shows as PXC #{q}.
                      </div>
                    )}
                  </div>
                  <button className="btn btn-primary import-btn" onClick={() => choose(candidate, true)}>
                    Import
                  </button>
                </div>
              )}
              {!isLoading && !candidate && (
                <div className="subtle import-hint">
                  {rustMode
                    ? `No Rust-lane token minted at id ${q} (checked PXC-20 & PXC-1155).`
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
          Solidity token = 0x address · Rust token = numeric id (read from RUSTVM). Both are PXC-20.
        </div>
      </div>
    </div>
  );
}
