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

  // Price of each token expressed in PEX, derived from its token/PEX pool reserves.
  const priceInPex = useMemo(() => {
    const map = new Map<string, number>();
    const decimalsOf = (addr?: string) =>
      tokens.find((t) => t.address.toLowerCase() === addr?.toLowerCase())?.decimals ?? 18;

    for (const p of pools) {
      const a0 = p.token0Addr?.toLowerCase();
      const a1 = p.token1Addr?.toLowerCase();
      if (p.reserve0 === 0n || p.reserve1 === 0n) continue;

      let otherAddr: string | undefined;
      let pexReserve: bigint | undefined;
      let otherReserve: bigint | undefined;
      if (a0 === wpex) {
        otherAddr = a1; pexReserve = p.reserve0; otherReserve = p.reserve1;
      } else if (a1 === wpex) {
        otherAddr = a0; pexReserve = p.reserve1; otherReserve = p.reserve0;
      }
      if (!otherAddr || !pexReserve || !otherReserve) continue;

      const pex = Number(formatUnits(pexReserve, 18));
      const other = Number(formatUnits(otherReserve, decimalsOf(otherAddr)));
      if (other > 0) map.set(otherAddr, pex / other);
    }
    return map;
  }, [pools, tokens]);

  function priceLabel(addr: string): string {
    const lower = addr.toLowerCase();
    if (addr === NATIVE_PEX.address || lower === wpex) return "1 PEX";
    const p = priceInPex.get(lower);
    if (!p) return "—";
    return `${p.toLocaleString(undefined, { maximumSignificantDigits: 6 })} PEX`;
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
