import { useMemo, useState } from "react";
import { isAddress, getAddress, type Address } from "viem";
import { useReadContracts, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Token } from "../config/tokens";
import { ERC20_ABI } from "../config/abis";
import { colorForAddress } from "../hooks/useTokenList";
import { isRustId, adminSlot, balanceSlot, RUSTVM_ADDRESS, RUST_NAMESPACES } from "../lib/rustvm";
import { TokenIcon, LaneMark, IconClose } from "./Icons";

// A rust token has no real contract; we key it in the UI by its id encoded as an
// address so it stays unique and de-dupes cleanly.
const rustKey = (id: bigint): Address => getAddress(("0x" + id.toString(16).padStart(40, "0")) as Address);

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

  // ---- Rust path: prove the id exists from admin_slot at RUSTVM (no 0x contract) ----
  const { data: rust, isLoading: rustLoading } = useQuery({
    queryKey: ["rust-detect", q],
    enabled: rustMode && !alreadyListed && !!publicClient,
    queryFn: async () => {
      for (const { ns, label } of RUST_NAMESPACES) {
        const word = await publicClient!.getStorageAt({ address: RUSTVM_ADDRESS, slot: adminSlot(ns, rustId!) });
        if (word && word !== "0x" && BigInt(word) !== 0n) return { ns, label };
      }
      return null;
    },
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
    if (rustMode && rust) {
      return {
        address: key,
        symbol: `PXC #${q}`,
        name: `Rust ${rust.label} #${q}`,
        decimals: 0,
        lane: "rust",
        id: Number(q),
        color: colorForAddress(key),
      };
    }
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
