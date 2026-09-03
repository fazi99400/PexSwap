import { useState } from "react";
import { Header, Tab } from "./components/Header";
import { Swap } from "./pages/Swap";
import { Pool } from "./pages/Pool";
import { Tokens } from "./pages/Tokens";
import { About } from "./pages/About";
import { Team } from "./pages/Team";

export default function App() {
  const [tab, setTab] = useState<Tab>("swap");

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
