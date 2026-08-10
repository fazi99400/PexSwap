# 🚀 Launching Lifelox — no VPS, everything on GitHub

Two parts:

1. **Deploy the contracts** to the pexli-v2 blockchain (from your own laptop).
2. **Publish the interface** on **GitHub Pages** (free, no server).

You only need: your laptop with **Node.js 20+** and **git**, a **funded pexli-v2
key**, and this GitHub repo.

---

## The Lifelox web setup (two repos, one brand)

Lifelox is **two independent repos** under one domain — the DEX and the wallet
stay separate and each deploys its own GitHub Pages site:

```
  lifelox.xyz            →  this repo (Lifelox DEX)          — Swap / Pool / Tokens
  wallet.lifelox.xyz     →  the Lifelox wallet repo (separate) — browser extension's web pages
```

They connect at runtime, no shared code deploy needed:

- The **Lifelox wallet** is a **browser extension** that announces itself via
  **EIP-6963** (`rdns xyz.lifelox.wallet`) and injects `window.ethereum`.
- The **DEX** discovers it (the Connect button prefers the Lifelox provider) and
  builds transactions with **`@lifelox/dex-sdk`** (this repo's `sdk/`). The wallet
  can import that same SDK for its in-app Swap — see [INTEGRATION.md](INTEGRATION.md).

So: edit the DEX here, edit the wallet in its own repo, and the EIP-6963 + SDK
contract keeps them working together. This guide covers the **DEX** side.

---

## Part A — Deploy the contracts to pexli-v2

### A1. Get the chain's RPC and a funded key
You need two things from your pexli-v2 network:
- **RPC URL** — the `eth_*` JSON-RPC endpoint of a pexli node (e.g. `https://rpc.pexli...`
  for a public node, or `http://127.0.0.1:8545` if you run the node yourself — see the
  chain's `RUN-TESTNET.md`).
- **A private key with some PEX** for gas (use the chain's faucet, `pexli-faucet`).

> ⚠️ For a *public* website (Part B), the RPC must be reachable from the internet **and
> served over HTTPS** — browsers block an HTTPS page from calling an `http://` RPC.
> A `localhost` RPC only works for you, on your machine.

### A2. Deploy
```bash
git clone https://github.com/fazi99400/Lifelox.git
cd Lifelox/contracts-solidity
npm install

export PEXLI_RPC_URL="https://your-pexli-rpc"     # from A1
export PRIVATE_KEY="0xYOUR_FUNDED_KEY"            # from A1
export SEED=1                                      # also create a demo USDP/PXLI pool
npm run deploy
```

This compiles the contracts (no compiler download needed — it uses the bundled solc),
deploys **WPEX, Factory, Router** and two demo tokens, optionally seeds a pool, and
prints a block like:

```
VITE_PEXLI_CHAIN_ID=78901
VITE_PEXLI_RPC_URL=https://your-pexli-rpc
VITE_LIFELOX_FACTORY=0x...
VITE_LIFELOX_ROUTER=0x...
VITE_WPEX=0x...
VITE_TOKEN_USDP=0x...
VITE_TOKEN_PXLI=0x...
```

**Copy that block — you need it in Part B.** It is also saved to
`contracts-solidity/deployments.json`.

> If your node's gas estimation is strict, add `export GAS_LIMIT=9000000` before
> `npm run deploy`.

### A3. (Only for Rust-lane tokens) deploy the cross-lane AMM

The factory above is the plain EVM one: **every pool side must be a `0x` contract**, so
a Rust-lane token (a numeric id) cannot be pooled on it — that pool needs the
cross-lane contracts in `contracts-solidity/contracts/dual/`. They are already written;
they just have to be deployed:

```bash
cd contracts-solidity
export PEXLI_RPC_URL="https://your-pexli-rpc"
export PRIVATE_KEY="0xYOUR_FUNDED_KEY"
npm run bridge:check -- --id 90909      # first prove the bridge answers on your chain
npm run deploy:dual
```

Redeploying? The factory and router changed shape together, so **both** must be
redeployed — withdraw any liquidity from the old dual factory first. To keep a factory
that is already on the current code and replace only the router:

```bash
DUAL_FACTORY="0xYourExistingDualFactory" npm run deploy:dual
```

It prints (and saves to `deployments-dual.json`):

```
VITE_LIFELOX_DUAL_FACTORY=0x...
VITE_LIFELOX_DUAL_ROUTER=0x...
```

Add those two in Part B alongside the rest, and the interface will create, list and
swap Rust ↔ Solidity pools — PEX pools natively here, no WPEX involved. Without them
the app says so instead of sending a transaction that cannot succeed.

---

## Part B — Publish the interface on GitHub Pages

The repo already has the workflow at `.github/workflows/deploy-pages.yml`. It builds
`frontend/` and deploys it to Pages automatically.

### B1. Turn on GitHub Pages
1. Go to your repo on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

### B2. Add the deployed addresses as repo Variables
The site reads the contract addresses at build time. Add them once:

1. Repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab.
2. Click **New repository variable** and add each line from Part A (name = left side,
   value = right side):

   | Name | Value |
   |------|-------|
   | `VITE_PEXLI_CHAIN_ID` | e.g. `78901` |
   | `VITE_PEXLI_RPC_URL` | your HTTPS pexli RPC |
   | `VITE_LIFELOX_FACTORY` | `0x…` |
   | `VITE_LIFELOX_ROUTER` | `0x…` |
   | `VITE_LIFELOX_DUAL_FACTORY` | `0x…` (optional — cross-lane / Rust pools) |
   | `VITE_LIFELOX_DUAL_ROUTER` | `0x…` (optional — cross-lane / Rust pools) |
   | `VITE_WPEX` | `0x…` |
   | `VITE_TOKEN_USDP` | `0x…` |
   | `VITE_TOKEN_PXLI` | `0x…` |

   (These are public addresses, not secrets — Variables is the right place.)

### B3. Trigger the deploy
Either push any change to `frontend/`, **or** run it manually:
- Repo → **Actions** → **Deploy Lifelox frontend to GitHub Pages** → **Run workflow**.

When it finishes (green ✓), the DEX is served on the apex domain (see B4):

```
https://lifelox.xyz
```

### B4. Custom domain — lifelox.xyz
`frontend/public/CNAME` already contains `lifelox.xyz`, so the Pages build claims
the apex domain. Point DNS at GitHub Pages once, at your registrar:

| Type | Host | Value |
|------|------|-------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `fazi99400.github.io` |

Then repo → **Settings → Pages → Custom domain** → enter `lifelox.xyz` → **Save**,
and tick **Enforce HTTPS** once the certificate is issued (a few minutes).

> Because it's served from the apex root, the build uses base `/` (the workflow
> sets `VITE_BASE=/`). If you ever drop the custom domain, change it back to
> `/<repo>/`.

The DEX is now public at **https://lifelox.xyz** — anyone with the Lifelox wallet
extension on Pexli can swap and provide liquidity.

---

## Part C — Let users add the network

Tell users to add pexli-v2 to MetaMask (or the app's **Switch to Pexli v2** button does
it): RPC = your HTTPS pexli RPC, Chain ID = your chain id, Currency symbol = **PEX**.

---

## Updating later

- **Change the UI** → push to `frontend/` → Pages redeploys automatically.
- **Redeploy contracts** → run `npm run deploy` again → update the repo Variables with
  the new addresses → re-run the Pages workflow.

## Common gotchas

| Symptom | Fix |
|---------|-----|
| Site loads but wallet can't connect / calls fail | RPC must be HTTPS and internet-reachable (not `localhost`). |
| Blank page on Pages | The `VITE_BASE` must match the repo name — the workflow sets it automatically to `/<repo>/`. |
| "insufficient funds" on deploy | Fund the deployer key with PEX (faucet), then re-run. |
| Pools list empty | You haven't seeded a pool yet — deploy with `SEED=1`, or create one in the **Pool → New Position** tab. |
| A Rust token shows as `PXC #id` | That id has no name/symbol written on-chain (metadata is optional and write-once), or your node has no bridge precompile — check with `npm run bridge:check -- --id <id>`. The app never invents a ticker. |
| Can't create a pool with a Rust token | The cross-lane contracts aren't deployed / not configured — see A3, then set `VITE_LIFELOX_DUAL_FACTORY` + `VITE_LIFELOX_DUAL_ROUTER`. |
| The site doesn't show your latest change | The site is built from one branch only — Pages uses `on.push.branches` in `.github/workflows/deploy-pages.yml`, Vercel uses its Production Branch. Work on another branch is invisible until it lands there. |
| You set the env vars but nothing changed | Vite bakes `VITE_*` in **at build time**, and each host reads them from its own place: GitHub Pages → repo **Settings → Variables**, Vercel → **Project → Settings → Environment Variables**. Setting them in the wrong place, or not redeploying after setting them, leaves the old build untouched. |
