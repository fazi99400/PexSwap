import { Token } from "../config/tokens";
import { TokenIcon, LaneMark, IconClose } from "./Icons";

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
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div>
          {tokens.map((t) => (
            <div key={`${t.symbol}-${t.address}`} className="token-row" onClick={() => onSelect(t)}>
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
        </div>
        <div className="subtle modal-note">
          Rust and Solidity tokens trade in the same pools — one fused block.
        </div>
      </div>
    </div>
  );
}
