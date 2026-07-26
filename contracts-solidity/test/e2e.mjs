// End-to-end test of the Lifelox stack on a real in-memory EVM (ganache).
// Deploys WPEX + Factory + Router + two PXC-20 tokens, then exercises:
//   create pool, add liquidity, quote, swap (token+native), remove liquidity.
// No mocks — every assertion runs against actual deployed bytecode.
//
// Explicit gasLimits are used throughout: this ganache build falls back to a
// pure-JS µWS and its eth_estimateGas is unreliable, so we skip estimation.
import ganache from "ganache";
import { ethers } from "ethers";
import { compileAll } from "./compile.mjs";

const E = (n) => ethers.parseEther(String(n));
const TX = { gasLimit: 9_000_000n };
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

async function main() {
  console.log("Compiling contracts (solc wasm)...");
  const art = compileAll();
  console.log(`  compiled ${Object.keys(art).length} contracts`);

  const MNEMONIC = "test test test test test test test test test test test junk";
  const server = ganache.server({
    logging: { quiet: true },
    wallet: { mnemonic: MNEMONIC, defaultBalance: 1_000_000 },
    chain: { chainId: 9042 },
    miner: { blockGasLimit: 30_000_000 },
  });
  await server.listen(8547);
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8547");
  // NonceManager tracks the nonce locally — the ganache µWS fallback misreports
  // the pending tx count, which otherwise collides every deploy at nonce 0.
  const wallet = new ethers.NonceManager(ethers.Wallet.fromPhrase(MNEMONIC).connect(provider));
  const me = await wallet.getAddress();

  const deploy = async (name, args = []) => {
    const f = new ethers.ContractFactory(art[name].abi, art[name].bytecode, wallet);
    const c = await f.deploy(...args, TX);
    await c.waitForDeployment();
    console.log(`    deployed ${name} @ ${await c.getAddress()}`);
    return c;
  };

  console.log("\nDeploying stack...");
  const wpex = await deploy("WPEX");
  const factory = await deploy("LifeloxFactory", [me]);
  const router = await deploy("LifeloxRouter", [await factory.getAddress(), await wpex.getAddress()]);
  const usdp = await deploy("PXC20Token", ["Pexli USD", "USDP", E(1_000_000)]);
  const pxli = await deploy("PXC20Token", ["Pexli Gold", "PXLI", E(1_000_000)]);
  console.log("  deployed WPEX / Factory / Router / USDP / PXLI");

  const routerAddr = await router.getAddress();
  const A = await usdp.getAddress();
  const B = await pxli.getAddress();
  const W = await wpex.getAddress();
  const dl = Math.floor(Date.now() / 1000) + 1200;

  // router.initCodeHash must equal factory.pairCodeHash for pairFor() to resolve.
  check("router initCodeHash matches factory", (await router.initCodeHash()) === (await factory.pairCodeHash()));

  console.log("\nTest: create pool");
  check("no pair before creation", (await factory.getPair(A, B)) === ethers.ZeroAddress);

  await (await usdp.approve(routerAddr, ethers.MaxUint256, TX)).wait();
  await (await pxli.approve(routerAddr, ethers.MaxUint256, TX)).wait();

  // addLiquidity on a non-existent pair CREATES the pool (router -> factory.createPair).
  await (await router.addLiquidity(A, B, E(10_000), E(40_000), 0, 0, me, dl, TX)).wait(); // 1 USDP = 4 PXLI

  const pairAddr = await factory.getPair(A, B);
  check("pool created (pair address set)", pairAddr !== ethers.ZeroAddress);
  check("allPairsLength == 1", (await factory.allPairsLength()) === 1n);

  const pair = new ethers.Contract(pairAddr, art["LifeloxPair"].abi, wallet);
  check("LP tokens minted to provider", (await pair.balanceOf(me)) > 0n);
  const [r0, r1] = await pair.getReserves();
  check("reserves seeded", r0 > 0n && r1 > 0n);

  console.log("\nTest: add liquidity to existing pool");
  const lpBefore = await pair.balanceOf(me);
  await (await router.addLiquidity(A, B, E(1_000), E(4_000), 0, 0, me, dl, TX)).wait();
  check("more LP minted", (await pair.balanceOf(me)) > lpBefore);

  console.log("\nTest: swap (exact tokens in)");
  const path = [A, B];
  const quote = await router.getAmountsOut(E(100), path);
  check("quote returns 2 hops", quote.length === 2 && quote[1] > 0n);
  const pxliBefore = await pxli.balanceOf(me);
  await (await router.swapExactTokensForTokens(E(100), 0, path, me, dl, TX)).wait();
  const received = (await pxli.balanceOf(me)) - pxliBefore;
  check("received PXLI from swap", received > 0n);
  check("received matches quote exactly", received === quote[1]);
  check("0.30% fee + curve applied (out < 400)", received < E(400));

  console.log("\nTest: native PEX liquidity + swap");
  await (await router.addLiquidityPEX(A, E(5_000), 0, 0, me, dl, { ...TX, value: E(5_000) })).wait();
  check("PEX/USDP pool created", (await factory.getPair(A, W)) !== ethers.ZeroAddress);
  const usdpBeforePex = await usdp.balanceOf(me);
  await (await router.swapExactPEXForTokens(0, [W, A], me, dl, { ...TX, value: E(10) })).wait();
  check("swapped native PEX for USDP", (await usdp.balanceOf(me)) > usdpBeforePex);

  console.log("\nTest: ETH-named aliases (wallet ABI: native = PEX)");
  const usdpBeforeEth = await usdp.balanceOf(me);
  await (await router.swapExactETHForTokens(0, [W, A], me, dl, { ...TX, value: E(10) })).wait();
  check("swapExactETHForTokens works (PEX in)", (await usdp.balanceOf(me)) > usdpBeforeEth);

  await (await usdp.approve(routerAddr, ethers.MaxUint256, TX)).wait();
  const pexBeforeEth = await provider.getBalance(me);
  const rcpt = await (await router.swapExactTokensForETH(E(50), 0, [A, W], me, dl, TX)).wait();
  const gasCost = rcpt.gasUsed * rcpt.gasPrice;
  check("swapExactTokensForETH returns native PEX", (await provider.getBalance(me)) + gasCost > pexBeforeEth);

  console.log("\nTest: remove liquidity");
  const lp = await pair.balanceOf(me);
  await (await pair.approve(routerAddr, lp, TX)).wait();
  const usdpPre = await usdp.balanceOf(me);
  await (await router.removeLiquidity(A, B, lp, 0, 0, me, dl, TX)).wait();
  check("LP burned to zero", (await pair.balanceOf(me)) === 0n);
  check("got underlying tokens back", (await usdp.balanceOf(me)) > usdpPre);

  await server.close();
  console.log(`\nAll ${passed} checks passed.`);
}

main().catch((e) => {
  console.error("\n" + (e?.reason ?? e?.shortMessage ?? e?.message ?? e));
  process.exit(1);
});
