// The cross-lane router's native-PEX paths, on a real in-memory EVM.
//
// A Rust side needs the bridge and cannot be faked locally, but the PEX handling
// can: a Solidity↔Solidity dual pool exercises exactly the code a PEX ↔ Rust pool
// runs for its PEX side — wrap on the way in, unwrap on the way out — with no
// bridge involved. That is what makes a cross-lane pool feel like a normal one:
// the user signs `addLiquidity` with value, not a separate WPEX.deposit first.
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
const DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 3600);

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
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8549");
  const signer = await provider.getSigner(0);
  const me = await signer.getAddress();
  const wallet = new ethers.NonceManager(signer);

  const deploy = async (name, args = []) => {
    const f = new ethers.ContractFactory(art[name].abi, art[name].bytecode, wallet);
    const c = await f.deploy(...args, TX);
    await c.waitForDeployment();
    return c;
  };

  const wpex = await deploy("WPEX");
  const token = await deploy("PXC20Token", ["Test USD", "TUS", E(1_000_000)]);
  const factory = await deploy("LifeloxDualFactory");
  const router = await deploy("LifeloxDualRouter", [await factory.getAddress(), await wpex.getAddress()]);

  const wpexAddr = await wpex.getAddress();
  const tokenAddr = await token.getAddress();
  const routerAddr = await router.getAddress();
  const pexAsset = solidityAsset(wpexAddr);
  const tokAsset = solidityAsset(tokenAddr);

  await (await token.approve(routerAddr, ethers.MaxUint256, TX)).wait();

  // --- add liquidity paying native PEX, no separate wrap -------------------
  check("user holds no WPEX before", (await wpex.balanceOf(me)) === 0n);

  await (
    await router.addLiquidity(pexAsset, tokAsset, E(10), E(1000), me, DEADLINE, { ...TX, value: E(10) })
  ).wait();

  const pairAddr = await factory.getPair(pexAsset, tokAsset);
  check("pool created by addLiquidity", pairAddr !== ethers.ZeroAddress);

  const pair = new ethers.Contract(pairAddr, art.LifeloxDualPair.abi, provider);
  check("pool holds the wrapped PEX", (await wpex.balanceOf(pairAddr)) === E(10));
  check("pool holds the token side", (await token.balanceOf(pairAddr)) === E(1000));
  check("LP minted to the provider", (await pair.balanceOf(me)) > 0n);
  check("no WPEX stranded on the user", (await wpex.balanceOf(me)) === 0n);
  check("no PEX stranded in the router", (await provider.getBalance(routerAddr)) === 0n);

  // --- swap PEX in, no wrap ------------------------------------------------
  const tokBefore = await token.balanceOf(me);
  await (
    await router.swapExactInput(pexAsset, tokAsset, E(1), 0n, me, DEADLINE, false, { ...TX, value: E(1) })
  ).wait();
  const gained = (await token.balanceOf(me)) - tokBefore;
  check("swapping native PEX in pays out the token", gained > 0n);
  check("still no WPEX stranded on the user", (await wpex.balanceOf(me)) === 0n);

  // --- swap out to native PEX (unwrapPEX = true) ---------------------------
  const pexBefore = await provider.getBalance(me);
  const rc = await (
    await router.swapExactInput(tokAsset, pexAsset, E(100), 0n, me, DEADLINE, true, TX)
  ).wait();
  const spentGas = rc.gasUsed * rc.gasPrice;
  const pexAfter = await provider.getBalance(me);
  check("swapping out to PEX pays native PEX, not WPEX", pexAfter + spentGas > pexBefore);
  check("no WPEX left with the user after unwrap", (await wpex.balanceOf(me)) === 0n);
  check("router keeps no PEX", (await provider.getBalance(routerAddr)) === 0n);

  // --- WPEX stays available as a plain ERC-20 side -------------------------
  await (await wpex.deposit({ ...TX, value: E(5) })).wait();
  await (await wpex.approve(routerAddr, ethers.MaxUint256, TX)).wait();
  const lpBefore = await pair.balanceOf(me);
  const wpexHeld = await wpex.balanceOf(me);
  // No `value` this time: WPEX is pulled with transferFrom like any other ERC-20.
  await (await router.addLiquidity(tokAsset, pexAsset, E(100), E(1), me, DEADLINE, TX)).wait();
  check("plain WPEX path still works (no value sent)", (await pair.balanceOf(me)) > lpBefore);
  check("that path spent the user's WPEX", (await wpex.balanceOf(me)) === wpexHeld - E(1));

  // --- the router refuses stray PEX ---------------------------------------
  let rejected = false;
  try {
    await (await wallet.sendTransaction({ to: routerAddr, value: E(1), ...TX })).wait();
  } catch {
    rejected = true;
  }
  check("router refuses PEX sent directly", rejected);

  await server.close();
  console.log(`\n${passed}/${passed} checks passed — native PEX is handled by the router.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
