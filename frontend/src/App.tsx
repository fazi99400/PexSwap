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
        Lifelox · a community DEX on the Pexli&nbsp;v2 blockchain · Rust + Solidity, fused in one block
      </footer>
    </div>
  );
}
