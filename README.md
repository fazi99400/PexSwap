# 🟠 PexSwap

**A full decentralized exchange (DEX) for the [Pexli v2](https://github.com/fazi99400/Fazi-Nom/tree/claude/pexli-v2-block-review-wxqbhh/pexli-v2) blockchain.**

PexSwap is a Uniswap-V2-style constant-product AMM — but built for a chain that
runs **Rust and Solidity contracts in the same block**, against one shared state
tree, all covered by ZK validity proofs. Tokens from either lane trade through
the same pools. The interface is the Uniswap layout you already know, dressed in
**orange** instead of pink.

```
        Rust 🦀  +  Solidity  ──►  one fused pexli-v2 block  ──►  PexSwap pools
```

---

## What's inside

| Path | Lane | What it is |
|------|------|------------|
| `contracts-solidity/` | EVM | AMM **core** (Factory, Pair, LP token) + **periphery** (Router, WPEX). A clean Uniswap-V2 fork, rebranded PexSwap / PEX. |
| `contracts-rust/` | SBF | A native-Rust constant-product AMM with **identical economics** (0.30% fee, x·y=k), meant to run inside the proven `execute_block`. |
| `frontend/` | — | React + wagmi/viem trading UI. Swap, Add Liquidity, and a Tokens list. Orange theme. |
| `docs/` | — | Architecture and deployment notes. |

Both AMM implementations use the **same math** (verified against each other), so
a Rust-lane pool and a Solidity-lane pair price a trade the same way — which is
what makes cross-lane routing coherent.

---

## Quick start

### 1. Solidity lane (EVM)

```bash
cd contracts-solidity
npm install
npm run build                       # hardhat compile

# deploy WPEX + Factory + Router + demo tokens to pexli-v2
export PRIVATE_KEY=0x...            # a funded pexli-v2 key
export PEXLI_RPC_URL=http://127.0.0.1:8545
export PEXLI_CHAIN_ID=9042
npm run deploy:testnet
```

The deploy script prints the **Factory / Router / WPEX** addresses and the pair
init-code hash. Copy them into `frontend/.env`.

### 2. Rust lane (SBF)

```bash
cd contracts-rust
cargo test           # pure AMM math unit tests (no chain needed)
cargo build-sbf      # build the on-chain program (requires the pexli SBF toolchain)
```

> The `pexli-sdk` crate and `cargo build-sbf` are provided by the pexli-v2
> toolchain (the chain's Rust-contract SDK). The **pure math module compiles and
> its tests pass with plain `rustc`/`cargo`** — that's the part you can verify
> anywhere. On-chain build/deploy runs in the pexli node environment, the same
> way SP1 proving runs on CI in the reference repo.

### 3. Frontend

```bash
cd frontend
cp .env.example .env                # then paste in your deployed addresses
npm install
npm run dev                         # http://localhost:5173
```

Add the network to MetaMask: RPC `http://127.0.0.1:8545`, Chain ID `9042`,
symbol **PEX**. PexSwap will also offer a "Switch to Pexli v2" button.

---

## How a swap works

1. You pick two tokens (either lane) and an input amount.
2. The UI calls `Router.getAmountsOut` for a live quote (0.30% fee baked in).
3. Non-native inputs get a one-time `approve` to the Router.
4. `swapExact*` moves your tokens into the pair, the pair enforces `x·y=k`, and
   sends the output out — with a 0.5% slippage floor and a 20-minute deadline.

Native **PEX** is wrapped to **WPEX** on the fly by the Router, so the native
coin trades like any PXC-20 token.

---

## Design notes

- **0.30% fee**, `MINIMUM_LIQUIDITY` lock on first mint, optional 1/6 protocol
  fee — all faithful to Uniswap V2, so the security properties are well understood.
- **Deterministic pair addresses** via CREATE2 (Solidity) / PDA (Rust), so the
  router computes pool addresses without an on-chain lookup.
- **PXC-20 = ERC-20 ABI**: both lanes expose the same token interface on the EVM,
  which is why one pair contract can hold a Solidity token and a Rust token.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture.

## License

MIT.
