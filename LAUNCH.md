# 🚀 Launching Lifelox — no VPS, everything on GitHub

Two parts:

1. **Deploy the contracts** to the pexli-v2 blockchain (from your own laptop).
2. **Publish the interface** on **GitHub Pages** (free, no server).

You only need: your laptop with **Node.js 20+** and **git**, a **funded pexli-v2
key**, and this GitHub repo.

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
   | `VITE_WPEX` | `0x…` |
   | `VITE_TOKEN_USDP` | `0x…` |
   | `VITE_TOKEN_PXLI` | `0x…` |

   (These are public addresses, not secrets — Variables is the right place.)

### B3. Trigger the deploy
Either push any change to `frontend/`, **or** run it manually:
- Repo → **Actions** → **Deploy Lifelox frontend to GitHub Pages** → **Run workflow**.

When it finishes (green ✓), your DEX is live at:

```
https://fazi99400.github.io/Lifelox/
```

That URL is public — share it. Anyone with a wallet (MetaMask) on the pexli-v2
network can swap and provide liquidity.

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
