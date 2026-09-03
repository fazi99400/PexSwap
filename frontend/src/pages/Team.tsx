const FOCUS_AREAS = [
  {
    title: "Protocol",
    body: "The Solidity core/periphery (Uniswap-V2-style factory, pair, router) and the native Rust AMM that mirrors the same constant-product math.",
  },
  {
    title: "Cross-lane bridge",
    body: "The dual-lane contracts that let a Rust-lane token and a Solidity-lane token sit in the same pool through the chain's bridge precompile.",
  },
  {
    title: "Interface",
    body: "This React/TypeScript app — swap, pool, and token pages — and the EIP-6963 wallet integration SDK it ships to third-party wallets.",
  },
];

export function Team() {
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div className="card-title">
        <h2>Team</h2>
        <span className="pill-tag">Open source</span>
      </div>

      <p className="about-lead">
        Lifelox is built and maintained as an open-source project on top of{" "}
        <a href="https://github.com/fazi99400/Fazi-Nom/tree/claude/pexli-v2-block-review-wxqbhh/pexli-v2" target="_blank" rel="noreferrer">
          Pexli&nbsp;v2
        </a>
        . Rather than a fixed roster, work is organized around the areas the protocol
        actually needs — anyone reading the code and sending a pull request is part of
        building it.
      </p>

      <div className="about-section">
        <h3>What we're building</h3>
        <div className="team-grid">
          {FOCUS_AREAS.map((a) => (
            <div key={a.title} className="team-card">
              <div className="team-card-title">{a.title}</div>
              <div className="subtle">{a.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="about-section">
        <h3>Contribute</h3>
        <p className="subtle">
          The contracts, the Rust AMM, the frontend, and the wallet SDK are all in the{" "}
          <a href="https://github.com/fazi99400/PexSwap" target="_blank" rel="noreferrer">
            public repository
          </a>
          , with the test suite that has to keep passing. Issues and pull requests are
          welcome.
        </p>
      </div>

      <div className="about-section">
        <h3>Contact</h3>
        <p className="subtle">
          Reach the team at <a href="mailto:team@pex.li">team@pex.li</a>.
        </p>
      </div>
    </div>
  );
}
