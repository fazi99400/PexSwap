import { ConnectButton } from "./ConnectButton";
import { BrandMark } from "./Icons";

export type Tab = "swap" | "pool" | "tokens";

export function Header({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <header className="header">
      <div className="brand">
        <BrandMark size={34} />
        <span>
          Pex<span className="pex">Swap</span>
        </span>
      </div>

      <nav className="nav">
        {(["swap", "pool", "tokens"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <ConnectButton />
    </header>
  );
}
