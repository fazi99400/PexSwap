# Lifelox Architecture

Lifelox is an automated market maker (AMM) built for **Pexli v2**, a dual-VM L1
that executes Rust (SBF) and Solidity (EVM) smart contracts in the **same block**
against a single Sparse Merkle Tree of state, with the whole state transition
covered by ZK validity proofs.

Everything below follows from one fact: **both lanes expose the PXC-20 token
interface (ERC-20 ABI) and settle in the same block**, so a single pool can pair
a token from either lane.

---

## 1. Solidity lane (`contracts-solidity/`)

A Uniswap-V2 fork, rebranded for Lifelox/PEX. Sources live under
`contracts-solidity/contracts/` (Hardhat's default source root):

```
core/
  LifeloxFactory.sol     deploys pairs via CREATE2, keeps the registry
  LifeloxPair.sol        the x·y=k pool; mint / burn / swap / skim / sync
  LifeloxERC20.sol       the LP token (PXC-20 + EIP-2612 permit)
  libraries/             Math (sqrt/min), UQ112x112 (price accumulators)
  interfaces/            ILifeloxFactory, ILifeloxPair, IPXC20, ILifeloxCallee

periphery/
  LifeloxRouter.sol      safe user entry: liquidity + all swap variants
  WPEX.sol               wrapped native PEX (so PEX trades like a token)
  libraries/LifeloxLibrary.sol   pure pricing + deterministic pairFor()
  interfaces/            ILifeloxRouter, IWPEX

tokens/
  PXC20Token.sol         reference mintable PXC-20 for demos/tests
```

**Fee model.** 0.30% per swap (`997/1000`). The optional protocol fee mints LP
worth 1/6 of the growth in `sqrt(k)` to `feeTo` when enabled — identical to
Uniswap V2, so it inherits the same audited economics.

**Deterministic pairs.** `createPair` uses `CREATE2` with
`salt = keccak256(token0, token1)`. The router/library recompute a pair's address
off-chain from `factory`, the sorted tokens, and `factory.pairCodeHash()` — no
lookup call needed.

---

## 2. Rust lane (`contracts-rust/`)

A native-Rust AMM with **the same economics**, structured in the pexli
Solana-style program model.

```
src/
  lib.rs          program entrypoint + module wiring
  instruction.rs  Borsh instruction enum (InitializePool, AddLiquidity, …)
  processor.rs    account handling + PXC-20 CPI (transfer / mint_to / burn)
  state.rs        Pool account layout (PDA-addressed), SwapResult
  math.rs         pure constant-product math (unit-tested, no_std-friendly)
  error.rs        typed LifeloxError codes
```

**Pool address.** A pool is a PDA from `["lifelox_pool", token0, token1]` with
`token0 < token1` enforced — the Rust analogue of the Solidity CREATE2 pair, so
`(A,B)` and `(B,A)` map to one pool.

**Invariant check.** `settle_swap` re-derives reserves after moving funds and
enforces the fee-adjusted `k` non-decrease — a direct port of the Solidity
`balanceAdjusted` K check.

**Why the math matches.** `contracts-rust/src/math.rs` and
`LifeloxLibrary.sol` implement `getAmountOut` / `getAmountIn` / `quote` with the
same `997/1000` fee and rounding, so both lanes quote a trade identically. The
Rust module has `cargo test` coverage proving fee application and in/out inverse
behavior.

---

## 3. Frontend (`frontend/`)

React + TypeScript + **wagmi/viem**, talking to the EVM lane over standard
`eth_*` JSON-RPC.

```
src/
  config/    chain (Pexli v2 viem chain), wagmi, addresses, tokens, abis
  components/ Header, ConnectButton, TokenModal
  pages/     Swap, Pool (add liquidity), Tokens
  lib/       format/parse/deadline helpers
  theme.css  the orange design system
```

Each token in the list is tagged with its **lane** (`solidity` / `rust`) and the
UI renders a badge, but the swap/liquidity flow treats both identically — the
whole point of the fused-block design.

**Native PEX** is handled by routing through WPEX inside the router
(`swapExactPEXForTokens`, `addLiquidityPEX`, …), with dust refunds.

---

## 4. Trust & status

- The Solidity contracts are a faithful Uniswap-V2 port; audit the diff against
  the canonical V2 source rather than trusting it blind.
- The Rust program targets the pexli SBF toolchain (`pexli-sdk`, `cargo
  build-sbf`), provided by the chain. The **pure math** builds and tests with
  stock Rust today; the on-chain build runs in the pexli node/CI environment.
- No mock proofs, no fake balances — the same honesty posture as the pexli-v2
  reference repo.
