export function About() {
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div className="card-title">
        <h2>About Lifelox</h2>
        <span className="pill-tag">Testnet proof of concept</span>
      </div>

      <p className="about-lead">
        Lifelox is a constant-product (x·y=k) automated market maker for{" "}
        <a href="https://github.com/fazi99400/Fazi-Nom/tree/claude/pexli-v2-block-review-wxqbhh/pexli-v2" target="_blank" rel="noreferrer">
          Pexli&nbsp;v2
        </a>
        , a dual-VM Layer-1 that executes Rust (SBF) and Solidity (EVM) smart contracts in
        the same block, against one shared Merkle state tree. Tokens from either lane trade
        through the same pools, because on this chain they settle together.
      </p>

      <div className="about-section">
        <h3>What it does</h3>
        <ul className="about-list">
          <li><b>Swap</b> — live quotes, a 0.30% fee, native PEX auto-wrapped.</li>
          <li><b>Pool</b> — create a pool as the first liquidity provider, or add to an existing one.</li>
          <li><b>Tokens</b> — every pool registered on the factory, read straight from chain, Rust and Solidity tokens shown side by side.</li>
        </ul>
      </div>

      <div className="about-section">
        <h3>Where it stands</h3>
        <p className="subtle">
          Lifelox is deployed as a proof of concept on the Pexli&nbsp;v2 testnet at{" "}
          <a href="https://pex.li" target="_blank" rel="noreferrer">pex.li</a>. The AMM logic
          (Uniswap-V2-style core, router, and a native Rust implementation with identical
          math) is exercised by an end-to-end test suite on both lanes — see the{" "}
          <a href="https://github.com/fazi99400/PexSwap" target="_blank" rel="noreferrer">
            repository
          </a>{" "}
          for exactly what runs and passes.
        </p>
      </div>

      <div className="about-section">
        <h3>Open source</h3>
        <p className="subtle">
          The full source — Solidity contracts, the Rust AMM, the frontend, and the wallet
          integration SDK — is public under the MIT license. Read the code, run the tests
          yourself, fork it, or send a pull request.
        </p>
      </div>

      <div className="about-section">
        <h3>Get in touch</h3>
        <p className="subtle">
          Questions, partnerships, or security reports:{" "}
          <a href="mailto:team@pex.li">team@pex.li</a>
        </p>
      </div>
    </div>
  );
}
