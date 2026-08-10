// Native-PEX pools on a real in-memory EVM — no WPEX anywhere.
//
// PEX is a lane of its own: the pair holds it as its own balance and pays it back
// out as PEX. A Rust side needs the bridge and cannot be faked locally, but the
// PEX side is the same code either way, so a PEX ↔ token pool proves it.
//
//   node test/dual-pex.mjs
import ganache from "ganache";
import { ethers } from "ethers";
import { compileAll } from "./compile.mjs";

const TX = { gasLimit: 9_000_000n };
const E = (n) => ethers.parseEther(String(n));
let passed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    console.error(`  FAIL ${name}`);
    process.exitCode = 1;
    throw new Error("assertion failed: " + name);
  }
}

const solidityAsset = (token) => [0, token, 0n];
const nativeAsset = () => [2, ethers.ZeroAddress, 0n];
const DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 3600);

// This ganache build sometimes answers eth_getBalance from the pre-transaction
// state immediately after a receipt, so native reads are pinned to a block.
let provider;
const pexAt = (addr, block) => provider.getBalance(addr, block ?? "latest");

async function main() {
  console.log("Compiling contracts (solc wasm)...");
  const art = compileAll();

  const server = ganache.server({
    logging: { quiet: true },
    wallet: { mnemonic: "test test test test test test test test test test test junk", defaultBalance: 1_000_000 },
    chain: { chainId: 9044 },
    miner: { blockGasLimit: 30_000_000 },
  });
  await server.listen(8549);
  provider = new ethers.JsonRpcProvider("http://127.0.0.1:8549");
  const signer = await provider.getSigner(0);
  const me = await signer.getAddress();
  const wallet = new ethers.NonceManager(signer);

  const deploy = async (name, args = []) => {
    const f = new ethers.ContractFactory(art[name].abi, art[name].bytecode, wallet);
    const c = await f.deploy(...args, TX);
    await c.waitForDeployment();
    return c;
  };

  const token = await deploy("PXC20Token", ["Test USD", "TUS", E(1_000_000)]);
  const factory = await deploy("LifeloxDualFactory");
  const router = await deploy("LifeloxDualRouter", [await factory.getAddress()]);

  const tokenAddr = await token.getAddress();
  const routerAddr = await router.getAddress();
  const pexAsset = nativeAsset();
  const tokAsset = solidityAsset(tokenAddr);

  await (await token.approve(routerAddr, ethers.MaxUint256, TX)).wait();

  // --- one call creates the pool and seeds it with real PEX ----------------
  const seed = await (
    await router.addLiquidity(pexAsset, tokAsset, E(10), E(1000), me, DEADLINE, { ...TX, value: E(10) })
  ).wait();

  const pairAddr = await factory.getPair(pexAsset, tokAsset);
  check("pool created by addLiquidity, in one call", pairAddr !== ethers.ZeroAddress);

  const pair = new ethers.Contract(pairAddr, art.LifeloxDualPair.abi, provider);
  check("pool holds native PEX itself", (await pexAt(pairAddr, seed.blockNumber)) === E(10));
  check("pool holds the token side", (await token.balanceOf(pairAddr)) === E(1000));
  check("reserves see the PEX", (await pair.getReserves())[0] > 0n && (await pair.getReserves())[1] > 0n);
  check("LP minted to the provider", (await pair.balanceOf(me)) > 0n);
  check("no PEX stranded in the router", (await pexAt(routerAddr, seed.blockNumber)) === 0n);

  // --- swap PEX in ---------------------------------------------------------
  const tokBefore = await token.balanceOf(me);
  const inRc = await (
    await router.swapExactInput(pexAsset, tokAsset, E(1), 0n, me, DEADLINE, { ...TX, value: E(1) })
  ).wait();
  check("swapping PEX in pays out the token", (await token.balanceOf(me)) > tokBefore);
  check("the pool kept the PEX", (await pexAt(pairAddr, inRc.blockNumber)) === E(11));

  // --- swap out to PEX -----------------------------------------------------
  const pexBefore = await pexAt(me, inRc.blockNumber);
  const rc = await (await router.swapExactInput(tokAsset, pexAsset, E(100), 0n, me, DEADLINE, TX)).wait();
  const pexAfter = await pexAt(me, rc.blockNumber);
  check("swapping out pays real PEX", pexAfter + rc.gasUsed * rc.gasPrice > pexBefore);
  check("router keeps no PEX", (await pexAt(routerAddr, rc.blockNumber)) === 0n);

  // --- adding to the pool later, still one call ----------------------------
  const lpBefore = await pair.balanceOf(me);
  const [rPex, rTok] = await pair.getReserves();
  const [resPex, resTok] = (await pair.asset0())[0] === 2n ? [rPex, rTok] : [rTok, rPex];
  const addPex = E(1);
  const addTok = (addPex * resTok) / resPex; // at the current ratio
  await (
    await router.addLiquidity(pexAsset, tokAsset, addPex, addTok, me, DEADLINE, { ...TX, value: addPex })
  ).wait();
  check("adding liquidity later is one call too", (await pair.balanceOf(me)) > lpBefore);

  // --- the value must match the native side --------------------------------
  let rejected = false;
  try {
    await (
      await router.addLiquidity(pexAsset, tokAsset, E(1), E(1), me, DEADLINE, { ...TX, value: E(2) })
    ).wait();
  } catch {
    rejected = true;
  }
  check("mismatched PEX value is rejected", rejected);

  // --- withdrawing gives the PEX back, natively ----------------------------
  const lp = await pair.balanceOf(me);
  const pairWithSigner = pair.connect(wallet);
  await (await pairWithSigner.transfer(pairAddr, lp, TX)).wait();
  const beforeBurn = await pexAt(me);
  const burnRc = await (await pairWithSigner.burn(me, TX)).wait();
  check(
    "burning LP returns native PEX",
    (await pexAt(me, burnRc.blockNumber)) + burnRc.gasUsed * burnRc.gasPrice > beforeBurn
  );
  check("pool is drained", (await pexAt(pairAddr, burnRc.blockNumber)) < E(1) / 1000n);

  await server.close();
  console.log(`\n${passed}/${passed} checks passed — PEX pools natively, no WPEX involved.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
