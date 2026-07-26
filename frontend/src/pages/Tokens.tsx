import { DEFAULT_TOKENS } from "../config/tokens";
import { shortAddr } from "../lib/format";
import { TokenIcon, LaneMark } from "../components/Icons";

export function Tokens() {
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="card-title">
        <h2>Tokens</h2>
        <span className="pill-tag">Rust + Solidity, one chain</span>
      </div>
      <table className="pools-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Lane</th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          {DEFAULT_TOKENS.map((t) => (
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
              <td className="subtle mono">{shortAddr(t.address)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="subtle modal-note">
        Because pexli-v2 executes Rust and Solidity contracts in the same block against one
        shared state tree, a pool can hold a Rust-lane token on one side and a Solidity-lane
        token on the other. Lifelox treats them identically.
      </div>
    </div>
  );
}
