import { DEFAULT_TOKENS } from "../config/tokens";
import { shortAddr } from "../lib/format";

export function Tokens() {
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="card-title">
        <h2>Tokens</h2>
        <span className="subtle">Rust 🦀 + Solidity, one chain</span>
      </div>
      <table className="pools-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Symbol</th>
            <th>Lane</th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          {DEFAULT_TOKENS.map((t) => (
            <tr key={`${t.symbol}-${t.address}`}>
              <td>
                <span style={{ fontSize: 20, marginRight: 8 }}>{t.logo}</span>
                {t.name}
              </td>
              <td>
                <b>{t.symbol}</b>
              </td>
              <td>
                <span className={`lane-badge lane-${t.lane}`}>{t.lane}</span>
              </td>
              <td className="subtle">{shortAddr(t.address)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="subtle" style={{ marginTop: 16 }}>
        Because pexli-v2 executes Rust and Solidity contracts in the same block against one
        shared state tree, a pool can hold a Rust-lane token on one side and a Solidity-lane
        token on the other. PexSwap treats them identically.
      </div>
    </div>
  );
}
