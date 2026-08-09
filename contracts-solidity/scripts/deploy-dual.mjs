// Deploys the CROSS-LANE (dual) Lifelox AMM: LifeloxDualFactory + LifeloxDualRouter.
// These pools can pair a Solidity PXC-20 with a Rust-lane PXC token via the
// bridge precompile at 0x…0e13.
//
//   export PEXLI_RPC_URL=https://testrpc.pex.li
//   export PRIVATE_KEY=0xYOUR_FUNDED_KEY
//   node scripts/deploy-dual.mjs
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileAll } from "../test/compile.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RPC = process.env.PEXLI_RPC_URL;
const KEY = process.env.PRIVATE_KEY;
const GAS_LIMIT = process.env.GAS_LIMIT ? BigInt(process.env.GAS_LIMIT) : undefined;

if (!RPC || !KEY) {
  console.error("Set PEXLI_RPC_URL and PRIVATE_KEY first.");
  process.exit(1);
}

async function main() {
  console.log("Compiling…");
  const art = compileAll();
  const provider = new ethers.JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  const wallet = new ethers.NonceManager(new ethers.Wallet(KEY, provider));
  const me = await wallet.getAddress();
  console.log(`chainId ${net.chainId} · deployer ${me} · balance ${ethers.formatEther(await provider.getBalance(me))} PEX`);

  const overrides = GAS_LIMIT ? { gasLimit: GAS_LIMIT } : {};
  const deploy = async (name, args = []) => {
    const f = new ethers.ContractFactory(art[name].abi, art[name].bytecode, wallet);
    const c = await f.deploy(...args, overrides);
    await c.waitForDeployment();
    const a = await c.getAddress();
    console.log(`  ${name} ${a}`);
    return c;
  };

  const factory = await deploy("LifeloxDualFactory");
  const router = await deploy("LifeloxDualRouter", [await factory.getAddress()]);

  const out = {
    chainId: Number(net.chainId),
    rpc: RPC,
    LifeloxDualFactory: await factory.getAddress(),
    LifeloxDualRouter: await router.getAddress(),
    bridge: "0x0000000000000000000000000000000000000e13",
    rustVm: "0x0000000000000000000000000000000000000e12",
  };
  fs.writeFileSync(path.join(__dirname, "..", "deployments-dual.json"), JSON.stringify(out, null, 2));
  console.log("\nDual AMM deployed:");
  console.log(`VITE_LIFELOX_DUAL_FACTORY=${out.LifeloxDualFactory}`);
  console.log(`VITE_LIFELOX_DUAL_ROUTER=${out.LifeloxDualRouter}`);
  console.log("\nSaved to contracts-solidity/deployments-dual.json");
}

main().catch((e) => {
  console.error("Deploy failed:", e?.reason ?? e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
