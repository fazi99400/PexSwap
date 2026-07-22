import { Token } from "../config/tokens";

export function TokenModal({
  tokens,
  onSelect,
  onClose,
}: {
  tokens: Token[];
  onSelect: (t: Token) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-title">
          <h2>Select a token</h2>
          <button className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div>
          {tokens.map((t) => (
            <div key={`${t.symbol}-${t.address}`} className="token-row" onClick={() => onSelect(t)}>
              <span className="token-logo" style={{ fontSize: 24 }}>
                {t.logo ?? "🪙"}
              </span>
              <div style={{ flex: 1 }}>
                <div className="sym">
                  {t.symbol}
                  <span className={`lane-badge lane-${t.lane}`}>{t.lane}</span>
                </div>
                <div className="nm">{t.name}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="subtle" style={{ marginTop: 12, textAlign: "center" }}>
          Rust 🦀 and Solidity tokens trade in the same pools — one fused block.
        </div>
      </div>
    </div>
  );
}
