import { ConnectButton } from "./ConnectButton";
import { ThemeToggle } from "./ThemeToggle";
import { BrandMark } from "./Icons";

export type Tab = "swap" | "pool" | "tokens" | "about" | "team";

export function Header({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <header className="header">
      <div className="brand">
        <BrandMark size={34} />
        <span>
          Life<span className="pex">lox</span>
        </span>
      </div>

      <nav className="nav">
        {(["swap", "pool", "tokens", "about", "team"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <div className="header-right">
        <ThemeToggle />
        <ConnectButton />
      </div>
    </header>
  );
}
