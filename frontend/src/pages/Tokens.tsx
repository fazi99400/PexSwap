import { useMemo } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { shortAddr } from "../lib/format";
import { ADDRESSES } from "../config/addresses";
import { NATIVE_PEX } from "../config/tokens";
import { useTokenList } from "../hooks/useTokenList";
import { usePools } from "../hooks/usePools";
import { TokenIcon, LaneMark } from "../components/Icons";

const wpex = ADDRESSES.wpex.toLowerCase();

export function Tokens() {
  const { address } = useAccount();
  const { tokens } = useTokenList();
  const { pools } = usePools(address);

  // Price of each token in terms of whatever it is pooled against — PEX if a PEX
  // pool exists, otherwise the token on the other side of its pool.
  const priceInfo = useMemo(() => {
    const map = new Map<string, { price: number; symbol: string }>();
    const meta = (addr?: string) => tokens.find((t) => t.address.toLowerCase() === addr?.toLowerCase());

    for (const t of tokens) {
      const tl = t.address.toLowerCase();
      const cands = pools.filter(
        (p) =>
          p.reserve0 > 0n &&
          p.reserve1 > 0n &&
          (p.token0Addr?.toLowerCase() === tl || p.token1Addr?.toLowerCase() === tl)
      );
      if (!cands.length) continue;

      // Prefer a pool paired with PEX (WPEX); else use the first pool found.
      const pick =
        cands.find((p) => p.token0Addr?.toLowerCase() === wpex || p.token1Addr?.toLowerCase() === wpex) ??
        cands[0];

      const thisIs0 = pick.token0Addr?.toLowerCase() === tl;
      const thisReserve = thisIs0 ? pick.reserve0 : pick.reserve1;
      const otherReserve = thisIs0 ? pick.reserve1 : pick.reserve0;
      const otherAddr = thisIs0 ? pick.token1Addr : pick.token0Addr;

      const om = meta(otherAddr);
      const otherDec = om?.decimals ?? 18;
      let otherSym = om?.symbol ?? "?";
      if (otherAddr?.toLowerCase() === wpex || otherSym === "WPEX") otherSym = "PEX";

      const thisAmt = Number(formatUnits(thisReserve, t.decimals));
      const otherAmt = Number(formatUnits(otherReserve, otherDec));
      if (thisAmt > 0) map.set(tl, { price: otherAmt / thisAmt, symbol: otherSym });
    }
    return map;
  }, [pools, tokens]);

  function priceLabel(addr: string): string {
    const lower = addr.toLowerCase();
    if (addr === NATIVE_PEX.address || lower === wpex) return "—";
    const info = priceInfo.get(lower);
    if (!info) return "—";
    return `${info.price.toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${info.symbol}`;
  }

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <div className="card-title">
        <h2>Tokens</h2>
        <span className="pill-tag">Prices in PEX</span>
      </div>
      <table className="pools-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Lane</th>
            <th>Price</th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={`${t.symbol}-${t.address}`}>
              <td>
                <div className="token-cell">
                  <TokenIcon token={t} size={30} />
                  <div>
                    <div className="sym">{t.symbol}</div>
                    <div className="nm">{t.name}</div>
                  </div>
                </div>
              </td>
              <td>
                <span className={`lane-badge lane-${t.lane}`}>
                  <LaneMark lane={t.lane} /> {t.lane}
                </span>
              </td>
              <td className="mono">{priceLabel(t.address)}</td>
              <td className="subtle mono">{shortAddr(t.address)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="subtle modal-note">
        Prices are read live from each token's pool with PEX. Import your token (token
        picker → paste address) and create a PEX pool to give it a price here.
      </div>
    </div>
  );
}
