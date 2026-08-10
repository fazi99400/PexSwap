# Cross-lane pools — trading Rust-lane (PXC) tokens on Lifelox

This is the **dual-lane AMM**: a pool can hold a Solidity PXC-20 on one side and a
**Rust-lane PXC token** (a numeric id, no contract) on the other, including a
Solidity↔Rust pair. It works because the chain exposes a **bridge precompile**.

> Contracts: [`contracts-solidity/contracts/dual/`](../contracts-solidity/contracts/dual).
> Compiles clean on solc 0.8.24. The bridge interaction can only be verified on the
> live chain (§"Testing" below) — there is no local precompile to fake it against.

## How it works

- **Bridge precompile** `0x…0e13` lets EVM code read/move Rust-lane tokens.
  Confirmed against the chain's own code:

  | Direction | How | What it can do |
  |---|---|---|
  | EVM → Rust, read | `staticcall` | balances `0x20` / `0x11`, NFT owner `0x71`, decimals `0x01`, symbol `0x02`, name `0x03`, raw account `0x50` |
  | EVM → Rust, write | `call` | PXC-20 transfer `0xA0`, PXC-1155 transfer `0xA1`, PXC-20 mint `0xA2` — all **from the caller** |
  | Rust → EVM, read | op `0x54` `OP_INVOKE_XLANE` | reads **one EVM storage slot** |
  | Rust → EVM, write | op `0x57` `OP_XLANE_WRITE` | writes into **one named EVM storage slot** |

  All of it is synchronous, in-block, under the same proof. Lifelox uses the reads
  and `0xA0`, wrapped in
  [`PxcBridge.sol`](../contracts-solidity/contracts/dual/PxcBridge.sol).
- **A pool side is an `Asset`**, not an address:
  ```solidity
  enum Lane { Solidity, Rust, Native }
  struct Asset { Lane lane; address token; uint64 id; }
  ```
  `Native` is PEX itself — the pair holds it as its own balance and pays it back out
  as PEX, so **nothing is ever wrapped**. There is no WPEX anywhere in a cross-lane
  pool; WPEX stays what it always was, an ordinary ERC-20 on the EVM lane.
- **`LifeloxDualPair`** is a Uniswap-V2 x·y=k pool that reads each reserve and pays
  out each side through the right lane (ERC-20 `balanceOf`/`transfer`, or the bridge).
  The pool's own address holds its own Rust-lane balance, and `0xA0` moves it.

## The one rule that changes everything: no `approve` on the Rust lane

On a bridge write the Rust-lane actor is the EVM **`caller`** — both lanes share one
address space, so a contract moves *its own* PXC and can never touch anyone else's.
That is exactly why a pair can hold PXC, and exactly why a router cannot pull a
user's. Nothing can *pull* a Rust token; every move is a **push by the holder**. So
Lifelox uses the V2 "**transfer in, then call**" pattern:

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
  If the bridge answers nothing, RUSTVM is asked with the same selectors before giving
  up, and both a `bytes32` and an ABI-encoded `string` answer decode correctly.
- **Pools are global** (`frontend/src/hooks/usePools.ts`): the Positions list and the
  Tokens table are built from `allPairs` on the factories, so a pool **anyone** creates
  is visible to **everyone**. Sides that are not in the built-in token list are hydrated
  on the fly (ERC-20 reads for Solidity, the bridge for Rust) and published into the
  shared token list, so those tokens also appear in every picker without an import.
- **Creating and swapping cross-lane pools** needs the dual contracts deployed and
  `VITE_LIFELOX_DUAL_FACTORY` + `VITE_LIFELOX_DUAL_ROUTER` set (see LAUNCH.md §A3).
  A pool **without** a Rust side (PEX ↔ token, token ↔ token) is **one call** —
  `addLiquidity` creates the pair and mints, with PEX riding along as `msg.value`.

  A pool **with** a Rust side is **two**: the PXC push, then `addLiquidity`. Nothing
  else is signed — the pair address is predicted off-chain (CREATE2), so no
  `createPair` call is needed, and PEX needs no approve and no wrap. An ERC-20 side
  costs one `approve`, exactly like the EVM lane. **Swap** is the same shape.
- **Why the Rust push cannot be merged into the same transaction.** A transaction has
  one destination, and the destination picks the lane — one transaction is one lane.
  So for PXC to enter a pool, exactly one of these would have to hold:
  1. *the user moves it* — a Rust-lane tx to `0x…0e12`, which therefore cannot also
     call the router;
  2. *the router moves it* — impossible, `0xA0` moves the caller's own balance and
     there is no allowance or delegated transfer on that lane;
  3. *a Rust-lane tx calls the router* — no such primitive: `0x54` only **reads** an
     EVM slot and `0x57` writes **one named slot**, neither is a function call, so
     neither can reach `mint()`.

  Two signatures is therefore the floor for anything with a Rust side, and the UI
  says so instead of hiding a second wallet prompt behind one button. Both can land
  in the same block; they are still two signatures.
- **Which side is token0, and where the pair lives**, are both decided by
  `AssetLib.key()` and recomputed off-chain (`frontend/src/lib/dual.ts`) — the second
  one matters because Rust tokens are pushed to the pair *before* it is deployed.
  `npm run test:dual-order` pins both to the contract: it creates real pairs
  (Solidity↔Rust, Rust↔Rust, Solidity↔Solidity) on an in-memory EVM and checks the
  UI's `asset0()` choice and its predicted CREATE2 address against the factory.
- **PEX is a lane, not a wrapper.** `npm run test:dual-pex` proves it on a real EVM:
  one call creates a pool holding real PEX, swaps go in and out as PEX, adding later
  is still one call, a mismatched `msg.value` is rejected, and burning LP returns
  native PEX — with nothing stranded in the router.
- **The two steps are shown as two steps**, numbered, with the second disabled until
  the first confirms. If someone signs step 1 and walks away, the PXC is sitting at
  the pair — not lost: the interface reads the pair's Rust balance against its
  reserves, says how much is waiting, and step 2 still mints it. That check survives
  a page reload, because it reads the chain rather than component state.
- **Decimals are checked before a pool is seeded.** A Rust amount is a `u64`, so a
  token's decimals cap how much of it can ever move — at 18 decimals that is about
  **18 whole tokens**, which makes a pool meaningless (the chain already has one:
  id `90909`, "Cat Coin", 18 decimals, whole supply reading as `0.00000000001`). The
  pool form spells out the base units being sent and refuses amounts over `u64`.
- **Withdrawing** works on both pair types the low-level V2 way — the LP tokens go
  back to the pair and `burn` pays each side out through its own lane. That is also
  the way out of a pool seeded at the wrong ratio.

## What would make it one transaction — a chain change, not a DEX change

The missing primitive is the Rust-lane equivalent of `approve`/`transferFrom`:

```
allowance[id][owner][spender]                       — a new Rust-lane mapping
0xA3  transferFrom20(id, from, to, amount)          — alongside 0xA0 on the bridge
        requires allowance[id][from][caller] >= amount, and decrements it
```

With that, a router could pull PXC the way it pulls an ERC-20, and **every** cross-lane
action collapses to one call after a one-time approve. It belongs in `pexli-chain`, not
here. Until it exists, do not work around it with a router that custodies user tokens
"temporarily" — that turns a missing primitive into a place funds can be lost.

## Live network

```
Chain ID   78901
RPC        https://testrpc.pex.li
Explorer   https://explorer.pex.li
Rust VM    0x0000000000000000000000000000000000000e12
Bridge     0x0000000000000000000000000000000000000e13

LifeloxDualFactory  0x3B88f759bF8549aa9Adf96353ef26B152120e52E
LifeloxDualRouter   0xd8E835e4BdE4D8AC52a128bcB3747cd41817b440
```

The interface defaults to those two; `VITE_LIFELOX_DUAL_FACTORY` /
`VITE_LIFELOX_DUAL_ROUTER` override them for a different deployment.

## Deploy

```bash
cd contracts-solidity && npm install
export PEXLI_RPC_URL=https://testrpc.pex.li
export PRIVATE_KEY=0xYOUR_FUNDED_KEY
npm run deploy:dual                # LifeloxDualFactory + LifeloxDualRouter

# Keep an existing factory (and every pool on it) and redeploy only the router:
DUAL_FACTORY=0xYourExistingFactory npm run deploy:dual
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
| **Rust amounts are `u64`** | Every PXC amount is 8 bytes while Solidity carries `uint256`; `PxcBridge.transfer20` reverts above `2^64-1`. With 18 decimals that caps at ~18 whole tokens — **use 6–8 decimals** for Rust tokens, and keep the check on every path including reserves and outputs. |
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
