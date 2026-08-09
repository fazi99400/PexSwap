// Standalone deployer for the Lifelox DEX — no Hardhat solc download needed.
// Compiles with the bundled solc wasm and deploys over plain JSON-RPC with ethers.
//
// By default this deploys ONLY the DEX core (everything the exchange needs):
//     WPEX  +  LifeloxFactory  +  LifeloxRouter
// No demo tokens. Bring your own token and pair it with PEX from the UI.
//
// Usage:
//   export PEXLI_RPC_URL=https://testrpc.pex.li/     # the chain's RPC
//   export PRIVATE_KEY=0xYOUR_FUNDED_KEY             # needs PEX for gas
//   node scripts/deploy-standalone.mjs
//
//   # optional: also deploy two demo tokens + seed a demo pool (for testing)
//   export DEMO=1
//
// Writes deployments.json and prints a ready-to-paste .env block.
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileAll } from "../test/compile.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E = (n) => ethers.parseEther(String(n));

const RPC = process.env.PEXLI_RPC_URL;
const KEY = process.env.PRIVATE_KEY;
const GAS_LIMIT = process.env.GAS_LIMIT ? BigInt(process.env.GAS_LIMIT) : undefined;
const DEMO = process.env.DEMO === "1"; // include demo tokens + seed a demo pool

if (!RPC || !KEY) {
  console.error("Set PEXLI_RPC_URL and PRIVATE_KEY environment variables first.");
  process.exit(1);
}

async function main() {
  console.log("Compiling with solc wasm…");
  const art = compileAll();
  console.log(`  ${Object.keys(art).length} contracts compiled`);

  const provider = new ethers.JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  const wallet = new ethers.NonceManager(new ethers.Wallet(KEY, provider));
  const me = await wallet.getAddress();
  const bal = await provider.getBalance(me);
  console.log(`\nNetwork chainId: ${net.chainId}`);
  console.log(`Deployer: ${me}`);
  console.log(`Balance : ${ethers.formatEther(bal)} PEX\n`);
  if (bal === 0n) {
    console.error("Deployer has 0 PEX — fund it first (faucet / transfer), then re-run.");
    process.exit(1);
  }

  const overrides = GAS_LIMIT ? { gasLimit: GAS_LIMIT } : {};
  const deploy = async (name, args = []) => {
    const f = new ethers.ContractFactory(art[name].abi, art[name].bytecode, wallet);
    const c = await f.deploy(...args, overrides);
    await c.waitForDeployment();
    const address = await c.getAddress();
    console.log(`  ${name.padEnd(16)} ${address}`);
    return c;
  };

  // ---- DEX core: everything the exchange needs ----
  console.log("Deploying the Lifelox DEX (WPEX + Factory + Router)…");
  const wpex = await deploy("WPEX");
  const factory = await deploy("LifeloxFactory", [me]);
  const router = await deploy("LifeloxRouter", [await factory.getAddress(), await wpex.getAddress()]);

  const addr = {
    chainId: Number(net.chainId),
    rpc: RPC,
    WPEX: await wpex.getAddress(),
    LifeloxFactory: await factory.getAddress(),
    LifeloxRouter: await router.getAddress(),
    pairInitCodeHash: await factory.pairCodeHash(),
  };

  // ---- Optional demo tokens + seeded pool (only with DEMO=1) ----
  if (DEMO) {
    console.log("\nDEMO=1 → deploying demo PXC-20 tokens + seeding a pool…");
    const usdp = await deploy("PXC20Token", ["Pexli USD", "USDP", E(1_000_000)]);
    const pxli = await deploy("PXC20Token", ["Pexli Gold", "PXLI", E(1_000_000)]);
    addr.USDP = await usdp.getAddress();
    addr.PXLI = await pxli.getAddress();

    const dl = Math.floor(Date.now() / 1000) + 1200;
    await (await usdp.approve(addr.LifeloxRouter, ethers.MaxUint256, overrides)).wait();
    await (await pxli.approve(addr.LifeloxRouter, ethers.MaxUint256, overrides)).wait();
    await (
      await router.addLiquidity(addr.USDP, addr.PXLI, E(10_000), E(40_000), 0, 0, me, dl, overrides)
    ).wait();
    console.log("  demo pool: 10,000 USDP + 40,000 PXLI (1 USDP = 4 PXLI)");
  }

  fs.writeFileSync(path.join(__dirname, "..", "deployments.json"), JSON.stringify(addr, null, 2));

  console.log("\n=== Deployed. Put these in Vercel Env Variables (or frontend/.env) ===\n");
  console.log(`VITE_PEXLI_CHAIN_ID=${addr.chainId}`);
  console.log(`VITE_PEXLI_RPC_URL=${addr.rpc}`);
  console.log(`VITE_LIFELOX_FACTORY=${addr.LifeloxFactory}`);
  console.log(`VITE_LIFELOX_ROUTER=${addr.LifeloxRouter}`);
  console.log(`VITE_WPEX=${addr.WPEX}`);
  if (DEMO) {
    console.log(`VITE_TOKEN_USDP=${addr.USDP}`);
    console.log(`VITE_TOKEN_PXLI=${addr.PXLI}`);
  }
  console.log("\nSaved full details to contracts-solidity/deployments.json");
  console.log("\nNext: paste the above into Vercel → Settings → Environment Variables → Redeploy.");
  if (!DEMO) {
    console.log("Your own token: open the site → token picker → Import by address → pair with PEX.");
  }
}

main().catch((e) => {
  console.error("\nDeploy failed:", e?.reason ?? e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
