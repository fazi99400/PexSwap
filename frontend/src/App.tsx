import { useState } from "react";
import { useAccount } from "wagmi";
import { Header, Tab } from "./components/Header";
import { Swap } from "./pages/Swap";
import { Pool } from "./pages/Pool";
import { Tokens } from "./pages/Tokens";
import { About } from "./pages/About";
import { Team } from "./pages/Team";
import { usePools } from "./hooks/usePools";

export default function App() {
  const [tab, setTab] = useState<Tab>("swap");
  const { address } = useAccount();
  // Reads every pool and publishes any token that isn't in the built-in list
  // to the shared token list (see hooks/useTokenList.ts). Called here, at the
  // top level, so pool-only tokens show up in Swap's picker on a fresh load —
  // not just after visiting Pool or Tokens, which call the same hook (and, on
  // the same account, share its cache) but only while mounted.
  usePools(address);

  return (
    <div className="app">
      <Header tab={tab} setTab={setTab} />
      <main className="container">
        {tab === "swap" && <Swap />}
        {tab === "pool" && <Pool />}
        {tab === "tokens" && <Tokens />}
        {tab === "about" && <About />}
        {tab === "team" && <Team />}
      </main>
      <footer className="footer">
        <div className="footer-links">
          <button className={tab === "about" ? "active" : ""} onClick={() => setTab("about")}>
            About
          </button>
          <span className="footer-dot">·</span>
          <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>
            Team
          </button>
        </div>
        <div className="footer-tagline">
          Lifelox · a community DEX on the Pexli chain · Rust + Solidity, fused in one block
        </div>
      </footer>
    </div>
  );
}
