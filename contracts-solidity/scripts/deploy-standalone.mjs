// Standalone deployer for the Lifelox stack — no Hardhat solc download needed.
// Compiles with the bundled solc wasm and deploys over plain JSON-RPC with ethers.
//
// Usage:
//   export PEXLI_RPC_URL=https://rpc.your-pexli-node        # the chain's RPC
//   export PRIVATE_KEY=0xYOUR_FUNDED_KEY                     # needs PEX for gas
//   export SEED=1                                            # (optional) seed a demo pool
//   node scripts/deploy-standalone.mjs
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
const SEED = process.env.SEED === "1";

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
    const addr = await c.getAddress();
    console.log(`  ${name.padEnd(16)} ${addr}`);
    return c;
  };

  console.log("Deploying core + periphery…");
  const wpex = await deploy("WPEX");
  const factory = await deploy("LifeloxFactory", [me]);
  const router = await deploy("LifeloxRouter", [await factory.getAddress(), await wpex.getAddress()]);

  console.log("\nDeploying demo PXC-20 tokens…");
  const usdp = await deploy("PXC20Token", ["Pexli USD", "USDP", E(1_000_000)]);
  const pxli = await deploy("PXC20Token", ["Pexli Gold", "PXLI", E(1_000_000)]);

  const addr = {
    chainId: Number(net.chainId),
    rpc: RPC,
    WPEX: await wpex.getAddress(),
    LifeloxFactory: await factory.getAddress(),
    LifeloxRouter: await router.getAddress(),
    USDP: await usdp.getAddress(),
    PXLI: await pxli.getAddress(),
    pairInitCodeHash: await factory.pairCodeHash(),
  };

  if (SEED) {
    console.log("\nSeeding a demo USDP/PXLI pool…");
    const dl = Math.floor(Date.now() / 1000) + 1200;
    await (await usdp.approve(addr.LifeloxRouter, ethers.MaxUint256, overrides)).wait();
    await (await pxli.approve(addr.LifeloxRouter, ethers.MaxUint256, overrides)).wait();
    await (
      await router.addLiquidity(addr.USDP, addr.PXLI, E(10_000), E(40_000), 0, 0, me, dl, overrides)
    ).wait();
    console.log("  pool created: 10,000 USDP + 40,000 PXLI (1 USDP = 4 PXLI)");
  }

  fs.writeFileSync(path.join(__dirname, "..", "deployments.json"), JSON.stringify(addr, null, 2));

  console.log("\n=== Deployed. Copy this into frontend/.env (or GitHub Actions Variables) ===\n");
  console.log(`VITE_PEXLI_CHAIN_ID=${addr.chainId}`);
  console.log(`VITE_PEXLI_RPC_URL=${addr.rpc}`);
  console.log(`VITE_LIFELOX_FACTORY=${addr.LifeloxFactory}`);
  console.log(`VITE_LIFELOX_ROUTER=${addr.LifeloxRouter}`);
  console.log(`VITE_WPEX=${addr.WPEX}`);
  console.log(`VITE_TOKEN_USDP=${addr.USDP}`);
  console.log(`VITE_TOKEN_PXLI=${addr.PXLI}`);
  console.log("\nSaved full details to contracts-solidity/deployments.json");
}

main().catch((e) => {
  console.error("\nDeploy failed:", e?.reason ?? e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
