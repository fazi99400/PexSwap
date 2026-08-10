# Lifelox Wallet ↔ DEX Integration

How the **Lifelox wallet** (EIP-1193 + EIP-6963, rdns `xyz.lifelox.wallet`) calls
the **Lifelox DEX** on Pexli (chainId **78901**, native coin **PEX**).

Everything here is implemented in the framework-agnostic SDK at [`sdk/`](sdk) and
unit-tested. Import it in the wallet:

```ts
import {
  getLifeloxProvider, connectLifelox, switchToPexli, watchWallet,
  rustBalanceOf, buildRustTransferTx, encodePxc20Transfer, rustBalanceSlot,
  fetchRustTokenMeta, encodeBridgeRead, decodeBytes32String,
  ROUTER_ABI, buildRouterSwapTx, planSwap,
  ERC20_ABI, validateTokenList,
  PEXLI_CHAIN_ID, RUSTVM_ADDRESS, PXC_BRIDGE_ADDRESS, NS, OP, BRIDGE,
} from "@lifelox/dex-sdk";
```

> **Single source of truth for chain constants:** [`sdk/src/constants.ts`](sdk/src/constants.ts).
> The Rust-lane values (RUSTVM address, namespaces, opcodes) follow the pexli-stf
> `rustvm.rs` spec. If the chain changes any of them, edit that one file.

---

## 1. Wallet connect (EIP-6963 → EIP-1193 fallback)

```ts
const { provider, address, chainId, onChainWrong } = await connectLifelox();
if (onChainWrong) await switchToPexli(provider);      // wallet_switchEthereumChain -> 0x13435
const stop = watchWallet(provider, {
  onAccountsChanged: (accs) => { /* update UI */ },
  onChainChanged:   (id)   => { /* id === 78901 ? */ },
});
```

- `getLifeloxProvider()` dispatches `eip6963:requestProvider`, collects
  `eip6963:announceProvider` details, and picks the one whose `info.rdns ===
  "xyz.lifelox.wallet"` (then a `name === "Lifelox"` match, then
  `window.ethereum`).
- `connectLifelox()` calls `eth_requestAccounts`, reads `eth_chainId`, and sets
  `onChainWrong = chainId !== 78901`.
- Chain id **78901** = `0x13435`.

---

## 2. Token standards — both lanes

Tokens come in two lanes; the wallet and DEX treat them uniformly through the
shared token list (§4).

### Solidity lane — PXC-20 = ERC-20

Standard ERC-20. Use `ERC20_ABI` and normal calls:

```ts
// balance
const bal = await provider.request({ method: "eth_call", params: [{
  to: token.address, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [address] })
}, "latest"]});
// approve the router before a token->x swap
const approveData = encodeApprove(ROUTER_ADDRESS, amount);
```

### Rust lane — state in the RUSTVM account

Rust-lane PXC tokens have **no ERC-20 contract**. Their state lives in the RUSTVM
system account (`RUSTVM_ADDRESS`, ends `…0e12`), keyed by a numeric `id`.

**Balance** — `eth_getStorageAt(RUSTVM_ADDRESS, slot)` where

```
slot = keccak256( ns(1 byte) ‖ id(8 bytes, big-endian) ‖ holder(20 bytes) )
```

| field  | width | notes                                   |
|--------|-------|-----------------------------------------|
| ns     | 1     | `0x20` = PXC-20, `0x11` = PXC-1155       |
| id     | 8     | token id, unsigned big-endian (u64)     |
| holder | 20    | account address                          |

Preimage is **29 bytes**; the slot is its keccak256. In the SDK:

```ts
const bal = await rustBalanceOf(publicClient, token.id, address);   // -> bigint
const slot = rustBalanceSlot(token.id, address, NS.PXC20);          // -> 0x… (32 bytes)
```

**Name / symbol / decimals** — these are *not* in RUSTVM storage. They are read with
`eth_call` against the bridge precompile (`PXC_BRIDGE_ADDRESS`, ends `…0e13`), the same
one the cross-lane pair uses on-chain:

```
data = selector(1 byte) ‖ id(8 BE)      // 0x01 decimals, 0x02 symbol, 0x03 name
```

Symbol and name come back as a **right-padded utf-8 `bytes32`**; decimals as a uint256.

```ts
const meta = await fetchRustTokenMeta(publicClient, token.id);
// { symbol: "RGOLD", name: "Rust Gold", decimals: 8, hasMetadata: true }
```

Metadata is **optional** on this chain. When `hasMetadata` is false, display `PXC #id`
and treat decimals as 0 — never render an empty symbol as if it were real.

**Transfer / operation** — a signed tx to `RUSTVM_ADDRESS` whose calldata is

```
data = op(1 byte) ‖ id(8 BE) ‖ to(20) ‖ amount(8 BE)          // 37 bytes total
```

| field  | width | notes                                  |
|--------|-------|----------------------------------------|
| op     | 1     | `XFER_20 = 0x21` (see rustvm.rs)        |
| id     | 8     | token id, big-endian                    |
| to     | 20    | recipient                               |
| amount | 8     | amount, unsigned big-endian (u64)       |

```ts
const tx = buildRustTransferTx(token.id, to, amount);   // { to: RUSTVM_ADDRESS, data, value: "0x0" }
await provider.request({ method: "eth_sendTransaction", params: [{ from: address, ...tx }] });
```

> Additional opcodes (approve, PXC-1155 transfer, …) must be added to
> `OP`/`NS` in `constants.ts` **verified against the live `pexli-stf/src/rustvm.rs`**
> — the SDK ships only what is confirmed (`NS.PXC20`, `NS.PXC1155`, `OP.XFER_20`)
> and does not invent codes.

---

## 3. Router / swap contract

A Uniswap-V2 router. Native coin (PEX) uses the standard **ETH-named** entry
points — on Pexli, "ETH" means PEX. Deployed address goes in the token list /
env; `deploy-standalone.mjs` prints it (also saved to `deployments.json`).

```
ROUTER_ADDRESS = <from deployment>        // see contracts-solidity/deployments.json
```

### Function signatures

```solidity
function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts);
function getAmountsIn (uint amountOut, address[] path) view returns (uint[] amounts);

function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[]);
function swapExactETHForTokens   (uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[]); // msg.value = PEX in
function swapExactTokensForETH   (uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[]); // PEX out
function swapETHForExactTokens   (uint amountOut, address[] path, address to, uint deadline) payable returns (uint[]);
function swapTokensForExactETH   (uint amountOut, uint amountInMax, address[] path, address to, uint deadline) returns (uint[]);
```

Selectors match Uniswap V2 exactly, so any V2-aware swap UI works unchanged. Full
JSON ABI: `ROUTER_ABI` in [`sdk/src/router.ts`](sdk/src/router.ts) and
[`frontend/src/config/abis.ts`](frontend/src/config/abis.ts).

### Building a swap

```ts
// quote
const amounts = await publicRead(ROUTER_ADDRESS, ROUTER_ABI, "getAmountsOut", [amountIn, path]);
const out = amounts[amounts.length - 1];
const minOut = (out * 995n) / 1000n; // 0.5% slippage

// one call decides ETH-in / ETH-out / token-token from the token standards
const tx = buildRouterSwapTx({
  router: ROUTER_ADDRESS, tokenIn, tokenOut, amountIn, amountOutMin: minOut,
  path, to: address, deadline: BigInt(Math.floor(Date.now()/1000) + 1200),
});
await provider.request({ method: "eth_sendTransaction", params: [{ from: address, ...tx }] });
```

`path` uses the **WPEX** address for a native leg (native PEX is wrapped inside
the router). Use each token's `address`; native PEX at position 0/last selects the
ETH-named function automatically.

### Swaps that involve a Rust-lane token

The router settles **ERC-20 / native** legs. A Rust-lane token is not an ERC-20,
so `planSwap()` returns a **two-step** plan: first a RUSTVM op that moves the
Rust-lane token to the router, then the router leg.

```ts
const plan = planSwap({ router, tokenIn, tokenOut, amountIn, amountOutMin, path, to, deadline });
if (plan.requiresRustLane) {
  for (const step of plan.steps) await provider.request({ method: "eth_sendTransaction", params: [{ from: address, ...step }] });
} else {
  await provider.request({ method: "eth_sendTransaction", params: [{ from: address, ...plan.steps[0] }] });
}
```

> **Honest boundary:** the pure-EVM router path (Solidity-lane + native PEX) is
> deployed and end-to-end tested (see §5). The **Rust-lane settlement leg** uses
> the documented RUSTVM op format above; whether a single on-chain contract can
> atomically pull Rust-lane state on the user's behalf depends on the live
> `pexli-stf` (its contract-initiated-transfer rules), which is **not something
> this repo can execute in a sandbox**. Confirm that leg on the testnet with the
> smoke script in §5 before shipping Rust↔EVM swaps to users.

---

## 4. Shared token list

[`tokenlist.json`](tokenlist.json) — used by the wallet **and** the DEX. Schema
(`TokenList` / `TokenEntry` in [`sdk/src/tokenlist.ts`](sdk/src/tokenlist.ts)):

```jsonc
{
  "name": "Lifelox Default",
  "chainId": 78901,
  "version": { "major": 1, "minor": 0, "patch": 0 },
  "tokens": [
    { "symbol": "USDP", "name": "Pexli USD", "lane": "solidity",
      "standard": "PXC-20", "address": "0x…", "decimals": 18 },
    { "symbol": "RGOLD", "name": "Rust Gold", "lane": "rust",
      "standard": "PXC-20", "id": 1, "decimals": 8 }
  ]
}
```

| field      | required | meaning |
|------------|----------|---------|
| `symbol`   | yes | display ticker |
| `lane`     | yes | `"solidity"` or `"rust"` |
| `standard` | yes | `"native"`, `"PXC-20"`, `"PXC-1155"` |
| `address`  | solidity/native | 0x contract (0x0 for native PEX) |
| `id`       | rust | numeric RUSTVM token id |
| `decimals` | yes | display decimals |

`validateTokenList(list)` enforces the rules (rust ⇒ `id`, solidity ⇒ `address`).

---

## 5. What is tested — and what you must test on testnet

| Check | Where | Status |
|-------|-------|--------|
| EIP-6963 discovery picks Lifelox rdns; fallback to `window.ethereum`; connect + chain flag | `sdk/test/wallet.test.mjs` | **pass** |
| Rust-lane slot = keccak256(ns‖id‖holder); op calldata = op‖id‖to‖amount byte layout; bridge metadata read = selector‖id with bytes32 decoding | `sdk/test/rustlane.test.mjs` | **pass** |
| Router calldata builders + planSwap (EVM vs Rust settlement) | `sdk/test/router.test.mjs` | **pass** |
| Router incl. `swapExactETHForTokens` / `swapExactTokensForETH` on a real EVM | `contracts-solidity/test/e2e.mjs` | **17/17 pass** |

```bash
cd sdk && npm install && npm test                 # 17 SDK unit tests
cd contracts-solidity && npm install && npm test  # 17 on-chain checks (ganache)
```

**Not verifiable from this repo (run it against your live testnet):** the actual
RUSTVM storage read for a real balance and the Rust-lane on-chain settlement.
A ready smoke script:

```bash
cd sdk && npm run build
node scripts/testnet-check.mjs \
  --rpc https://your-pexli-rpc --id 1 --holder 0xYourAddress
```

It verifies `eth_chainId === 78901`, derives the storage slot with the SDK, reads
it via `eth_getStorageAt`, and prints the decoded balance — proving the layout
against the running chain. Nothing here fakes that result; you run it and see it.
