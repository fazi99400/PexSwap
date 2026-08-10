# Cross-lane pools — trading Rust-lane (PXC) tokens on Lifelox

This is the **dual-lane AMM**: a pool can hold a Solidity PXC-20 on one side and a
**Rust-lane PXC token** (a numeric id, no contract) on the other, including a
Solidity↔Rust pair. It works because the chain exposes a **bridge precompile**.

> Contracts: [`contracts-solidity/contracts/dual/`](../contracts-solidity/contracts/dual).
> Compiles clean on solc 0.8.24. The bridge interaction can only be verified on the
> live chain (§"Testing" below) — there is no local precompile to fake it against.

## How it works

- **Bridge precompile** `0x…0e13` lets EVM code read/move Rust-lane tokens:
  - reads (staticcall): `0x20` balance, `0x01` decimals, `0x02` symbol, `0x03` name.
  - writes (call): `0xA0` PXC-20 transfer **from the caller**.
  Wrapped in [`PxcBridge.sol`](../contracts-solidity/contracts/dual/PxcBridge.sol).
- **A pool side is an `Asset`**, not an address:
  ```solidity
  enum Lane { Solidity, Rust }
  struct Asset { Lane lane; address token; uint64 id; } // token XOR id
  ```
- **`LifeloxDualPair`** is a Uniswap-V2 x·y=k pool that reads each reserve and pays
  out each side through the right lane (ERC-20 `balanceOf`/`transfer`, or the bridge).
  The pool's own address holds its own Rust-lane balance, and `0xA0` moves it.

## The one rule that changes everything: no `approve` on the Rust lane

Nothing can *pull* a Rust token. Every move is a **push by the holder**. So Lifelox
uses the V2 "**transfer in, then call**" pattern:

- **Solidity input** → the router pulls it with `transferFrom` (needs `approve`).
- **Rust input** → the user pushes it to the **pair address first**, as a plain tx to
  the Rust-VM account `0x…0e12` with calldata `op(0x21) | id(8) | to(pair,20) | amount(8 BE)`.
  Then the router/pair measures what arrived — exactly like V2 measures `balanceOf`.

### Frontend swap sequence (Rust → Solidity)
1. Compute the pair address from the factory (`getPair(assetIn, assetOut)`).
2. Send a Rust-VM tx: `to = 0x…0e12`, `data = 0x21 | id | pair | amount`.
3. Call `router.swapExactInput(assetIn, assetOut, amount, minOut, to, deadline)`
   — it measures the deposit and pays out the Solidity side.

### Frontend swap sequence (Solidity → Rust)
1. `approve` the router for the Solidity token.
2. Call `router.swapExactInput(...)` — it `transferFrom`s the input to the pair and
   the pair pays out the Rust side via `0xA0`.

## In the interface

- **Importing a rust token** (`frontend/src/lib/rustvm.ts`): typing a numeric id in the
  token picker does two reads — the RUSTVM admin slot proves the id is minted, and the
  bridge returns its **name, symbol and decimals**, so a rust id resolves to a real
  ticker exactly like a `0x` address resolves through ERC-20 `name()/symbol()/decimals()`.
  With no metadata on the id it falls back to `PXC #id` / decimals 0.
- **Pools are global** (`frontend/src/hooks/usePools.ts`): the Positions list and the
  Tokens table are built from `allPairs` on the factories, so a pool **anyone** creates
  is visible to **everyone**. Sides that are not in the built-in token list are hydrated
  on the fly (ERC-20 reads for Solidity, the bridge for Rust) and published into the
  shared token list, so those tokens also appear in every picker without an import.
  Set `VITE_LIFELOX_DUAL_FACTORY` to include cross-lane pools in that list; the EVM-lane
  swap/add-liquidity forms refuse a Rust side rather than sending a doomed transaction.

## Deploy

```bash
cd contracts-solidity && npm install
export PEXLI_RPC_URL=https://testrpc.pex.li
export PRIVATE_KEY=0xYOUR_FUNDED_KEY
npm run deploy:dual        # LifeloxDualFactory + LifeloxDualRouter
```

## Testing — on the chain, not on assumptions (prompt §6)

The bridge only exists on the live chain, so verify it there first:

```bash
# read a known Rust token's metadata + your balance through the bridge
node test/dual-bridge-check.mjs --rpc https://testrpc.pex.li --id 90909 --holder 0xYourAddr
```

If name/symbol/decimals read back correctly, the bridge works on your chain. Then
deploy the dual AMM, create a pool, and do one full round-trip (push a Rust token
into a pair, add the Solidity side, swap, read reserves).

## Constraints you must respect

| Constraint | Why it matters |
|---|---|
| **Rust amounts are `u64`** | `PxcBridge.transfer20` reverts if `amount > 2^64-1`. With 18 decimals a u64 caps at ~18 whole tokens — **use 6–8 decimals** for Rust tokens. |
| **No events on the Rust lane** | `eth_getLogs` never sees a Rust transfer. Pool discovery / balances must **read state**, not watch logs. |
| **Metadata is optional & write-once** | Absent metadata reads as empty name/symbol, decimals 0. Fall back to `PXC #id`; never render an empty symbol as real. |
| **Metadata is read off the bridge, not RUSTVM storage** | `eth_getStorageAt` on `0x…0e12` only proves the id exists (admin slot) and holds balances. name/symbol/decimals come from `eth_call` to `0x…0e13`. |
| **`staticcall` can't write** | Any function that moves PXC tokens must be non-view. |

## Honest status

- The contracts **compile clean** and follow the bridge spec exactly. The bridge
  calls themselves are **verified on the live testnet by you** (the sandbox that
  built this cannot reach `testrpc.pex.li`), using the check script above.
- This is a **testnet**: test PEX, no real value, unaudited, and the proving lane
  runs a reference backend — do not describe anything here as zero-knowledge secured.
