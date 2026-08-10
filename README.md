<div align="center">

# 🟠 Lifelox

### A full decentralized exchange for the [Pexli&nbsp;v2](https://github.com/fazi99400/Fazi-Nom/tree/claude/pexli-v2-block-review-wxqbhh/pexli-v2) blockchain

**Uniswap-V2-style AMM · orange, not pink · Rust and Solidity tokens in one pool**

![Solidity](https://img.shields.io/badge/Solidity-0.8.24-e85d00)
![Rust](https://img.shields.io/badge/Rust-2021-ff7a00)
![React](https://img.shields.io/badge/React-18-ff9a3d)
![Tests](https://img.shields.io/badge/e2e-15%2F15%20passing-2ea043)
![License](https://img.shields.io/badge/license-MIT-555)

</div>

---

Pexli&nbsp;v2 is a dual-VM Layer-1 that executes **Rust (SBF) and Solidity (EVM)
smart contracts in the same block**, against one shared Merkle state tree, with the
whole state transition covered by ZK validity proofs. Lifelox is a constant-product
(x·y=k) automated market maker built for exactly that: tokens from either lane trade
through the same pools, because on this chain they settle together.

```
     Rust 🦀  ┐
              ├──►  one fused pexli-v2 block  ──►  Lifelox pools  ──►  swap / LP
  Solidity ⬦  ┘         (shared SMT state)
```

<div align="center">

|  |  |
|:--:|:--:|
| **Swap** — live quotes, 0.30% fee, native PEX auto-wrapped | **Create Pool** — set the initial price as first LP |
| **Positions** — every pool + your share | **Light / dark** theme, all-SVG icon set |

</div>

---

## What's in the repo

```
Lifelox/
├── contracts-solidity/     EVM lane — a Uniswap-V2 fork, rebranded Lifelox/PEX
│   ├── contracts/
│   │   ├── core/           Factory, Pair (x·y=k), LP token, libraries, interfaces
│   │   ├── periphery/      Router (swaps + liquidity), WPEX, LifeloxLibrary
│   │   └── tokens/         PXC20Token — reference fungible token
│   ├── scripts/deploy.js   deploys the whole stack + demo tokens
│   └── test/e2e.mjs        real in-memory-EVM end-to-end test (15 checks)
│
├── contracts-rust/         Rust lane — native AMM, identical economics
│   └── src/                lib, instruction (Borsh), processor (PXC-20 CPI),
│                           state (PDA pools), math (unit-tested), error
│
├── frontend/               React + wagmi/viem interface, orange theme
│   └── src/
│       ├── pages/          Swap · Pool (Create Pool + Positions) · Tokens
│       ├── components/     Header, ThemeToggle, TokenModal, Icons (all SVG)
│       ├── hooks/          usePools — reads every pool from the factory
│       └── config/         chain, wagmi, addresses, tokens, ABIs
│
└── docs/ARCHITECTURE.md    deep dive on both lanes
```

---

## Features

- **Swap** — pick any two tokens, get a live `getAmountsOut` quote (0.30% fee baked
  in), one-tap approve, then swap with a 0.5% slippage floor and a 20-minute deadline.
  Native **PEX** is wrapped to **WPEX** on the fly.
- **Create Pool** — become the first liquidity provider for a new pair. The UI detects
  that the pool doesn't exist yet, shows a *"you set the initial price"* banner, and
  computes the price live from your two deposits.
- **Add Liquidity** — for an existing pool, the second amount is auto-held to the
  current reserve ratio.
- **Positions** — lists every pool registered on the factory with reserves and your
  LP share, read straight from chain. Pools are **global**: whoever creates one, every
  visitor sees it, and pool sides that aren't in the built-in list get their real
  name/symbol/decimals read on the fly (and show up in the token pickers too).
- **Token import, both lanes** — a `0x` address resolves through ERC-20
  `name()/symbol()/decimals()`; a **numeric rust id** resolves the same way through the
  bridge precompile, so a Rust token shows its real ticker instead of a placeholder.
- **Light / dark theme** — persisted to `localStorage`.
- **Lane badges** — each token is tagged Solidity (◆) or Rust (⬡); the whole app
  treats them identically.
- **No emojis in the UI** — every icon and coin is inline SVG.

---

## Wallet integration

Lifelox ships an SDK the **Lifelox Web3 wallet** (EIP-1193 + EIP-6963, rdns
`xyz.lifelox.wallet`) uses to talk to the DEX — connect, read PXC balances on
**both lanes**, and build swaps. See **[INTEGRATION.md](INTEGRATION.md)** and
[`sdk/`](sdk). Highlights:

- **EIP-6963 discovery** of the Lifelox provider (fallback `window.ethereum`),
  connect + verify chain 78901.
- **Rust-lane PXC tokens**: balance via `eth_getStorageAt` on the RUSTVM account
  (`slot = keccak256(ns‖id‖holder)`), name/symbol/decimals via `eth_call` to the bridge
  precompile (`0x01/0x02/0x03 ‖ id`), and transfers via op-coded calldata
  (`op‖id‖to‖amount`) — encoders unit-tested against the documented layout.
- **Router**: standard Uniswap-V2 ABI incl. `swapExactETHForTokens` /
  `swapExactTokensForETH` (native = PEX) — tested on a real EVM.
- **Shared [`tokenlist.json`](tokenlist.json)** used by wallet and DEX.

## Cross-lane pools (Rust ↔ Solidity)

Rust-lane PXC tokens (a numeric id, no contract) can be pooled with Solidity
tokens through the chain's **bridge precompile** (`0x…0e13`). The dual-lane AMM —
`LifeloxDualFactory` / `LifeloxDualPair` / `LifeloxDualRouter` in
[`contracts-solidity/contracts/dual/`](contracts-solidity/contracts/dual) — reads
and moves each side through its own lane (ERC-20 or the bridge). Because the Rust
lane has no `approve`, it uses the V2 "transfer in, then call" pattern: the holder
pushes the PXC side to the pair, then one `addLiquidity` call creates the pool and
mints. **PEX is a pool side in its own right** — the pair holds native PEX, so nothing
is wrapped.

- PEX ↔ token, token ↔ token: **one transaction**.
- Anything with a Rust side: **two** — the push, then the router call. That is the
  chain's floor, not a UI shortcut: the bridge moves PXC from the *caller* and the
  Rust lane has no allowance, so nothing can move a user's PXC for them. The UI shows
  it as two numbered steps rather than prompting twice behind one button.

The cross-lane contracts are already deployed on the testnet and the app defaults to
them. Full guide, constraints (u64 amounts, no events, 6–8 decimals), the on-chain test
flow, and the one chain change that would make it one transaction:
**[docs/RUST-POOLS.md](docs/RUST-POOLS.md)**.

## Tech used

| Area | Stack |
|------|-------|
| **Solidity lane** | Solidity `0.8.24`, Uniswap-V2 architecture (CREATE2 pairs, UQ112x112 oracle accumulators, EIP-2612 permit LP token) |
| **Rust lane** | Rust `2021`, `borsh` (serialization), `thiserror` (errors), `pexli-sdk` (the chain's Rust-contract SDK — accounts, CPI, PDAs) |
| **Frontend** | React `18`, TypeScript `5`, Vite `5`, wagmi `2`, viem `2`, @tanstack/react-query `5` |
| **Contract tooling** | `solc` `0.8.24` (wasm), `hardhat` (config/deploy), `ethers` `6` + `ganache` (e2e test harness) |
| **Dev / QA** | `playwright` (UI screenshots) |

---

## Testing — what actually ran

Nothing here is claimed working on faith. This is what was executed in this repo:

| Check | How | Result |
|-------|-----|--------|
| Solidity compiles | `solc 0.8.24` over all 16 sources | **0 errors, 0 warnings** |
| AMM end-to-end | `contracts-solidity/test/e2e.mjs` — deploys the stack to an in-memory EVM (ganache) and runs create-pool → add-liquidity → swap → native-PEX swap → remove-liquidity | **15/15 checks pass** |
| Swap correctness | assert received output `==` router quote, and `< ` no-fee amount | **pass** |
| Rust AMM math | `cargo test` on `contracts-rust/src/math.rs` | **4/4 pass** |
| Frontend build | `tsc` + `vite build` | **pass** |

Run them yourself:

```bash
# Solidity: compile + full e2e on a throwaway EVM (no network, no testnet needed)
cd contracts-solidity && npm install && npm test

# Rust: pure AMM math
cd contracts-rust && cargo test

# Frontend: type-check + build
cd frontend && npm install && npm run build
```

### Honest status

- The **Rust program's on-chain build** (`cargo build-sbf` against `pexli-sdk`) runs
  inside the pexli node/CI toolchain — the same way the reference repo's SP1 proving
  runs on CI, not in a bare sandbox. What is verified here is the **pure AMM math**,
  which compiles and tests with stock Rust.
- The e2e test runs on a standard EVM (ganache), which is what the pexli EVM lane
  exposes over `eth_*` JSON-RPC. It exercises the exact deployed bytecode — no mocks.
- Frontend contract addresses are placeholders until you deploy; the app degrades
  gracefully (empty pool list, disabled actions) until you fill in `frontend/.env`.

---

## Going live (no VPS)

Deploy the contracts from your laptop, then host the interface free on **GitHub
Pages** — full step-by-step in **[LAUNCH.md](LAUNCH.md)**. In short:

```bash
cd contracts-solidity && npm install
PEXLI_RPC_URL=https://your-pexli-rpc PRIVATE_KEY=0x... SEED=1 npm run deploy
```

then add the printed addresses as repo **Actions Variables** and enable Pages — the
included workflow (`.github/workflows/deploy-pages.yml`) builds and publishes on push.

## Quick start (local dev)

### 1 — Deploy the contracts

```bash
cd contracts-solidity
npm install
export PRIVATE_KEY=0x...                 # a funded pexli-v2 key
export PEXLI_RPC_URL=http://127.0.0.1:8545
export PEXLI_CHAIN_ID=78901
npm run deploy:testnet                    # prints Factory / Router / WPEX + demo tokens
```

### 2 — Run the interface

```bash
cd frontend
cp .env.example .env                      # paste in the addresses from step 1
npm install
npm run dev                               # http://localhost:5173
```

Add the network to MetaMask — RPC `http://127.0.0.1:8545`, Chain ID `78901`, symbol
**PEX** — or just use the in-app **Switch to Pexli v2** button.

---

## How the AMM works

Constant product: every pool keeps `reserve0 * reserve1 = k`. A swap of `Δin` returns

```
Δout = (Δin · 997 · reserveOut) / (reserveIn · 1000 + Δin · 997)
```

the `997/1000` being the 0.30% fee. The first liquidity provider sets the price by
choosing the deposit ratio and permanently locks `MINIMUM_LIQUIDITY` (1000 wei of LP)
to prevent the pool from being drained to zero. **The Rust lane implements the same
formula** (`contracts-rust/src/math.rs`), so a Rust pool and a Solidity pool price a
trade identically — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## License

MIT.
