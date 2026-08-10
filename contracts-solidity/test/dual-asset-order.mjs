// Checks the UI's asset ordering against the real cross-lane factory.
//
// A cross-lane pair sorts its two sides by AssetLib.key(); the interface
// recomputes that key off-chain (frontend/src/lib/dual.ts) to know which reserve
// belongs to which side. If the two ever disagree, every cross-lane ratio and
// quote in the UI is silently inverted — so this pins them together on a real
// in-memory EVM, with no bridge involved (createPair/initialize never call it).
//
//   node test/dual-asset-order.mjs
import ganache from "ganache";
import { ethers } from "ethers";
import { compileAll } from "./compile.mjs";

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

/** The frontend's AssetLib.key() reimplementation (lib/dual.ts). */
const assetKey = (a) =>
  a.lane === 1
    ? ethers.keccak256(ethers.solidityPacked(["uint8", "uint64"], [1, a.id]))
    : ethers.keccak256(ethers.solidityPacked(["uint8", "address"], [0, a.token]));
const isFirst = (a, b) => BigInt(assetKey(a)) < BigInt(assetKey(b));

/** The frontend's pairHash + CREATE2 prediction (lib/dual.ts). */
const pairHashOffChain = (a, b) => {
  const [x, y] = isFirst(a, b) ? [a, b] : [b, a];
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "address", "uint64", "uint8", "address", "uint64"],
      [x.lane, x.token, x.id, y.lane, y.token, y.id]
    )
  );
};
const predictPair = (factory, initCodeHash, a, b) =>
  ethers.getCreate2Address(factory, pairHashOffChain(a, b), initCodeHash);

const ZERO = ethers.ZeroAddress;
const solidityAsset = (token) => ({ lane: 0, token, id: 0n });
const rustAsset = (id) => ({ lane: 1, token: ZERO, id: BigInt(id) });
const tuple = (a) => [a.lane, a.token, a.id];

async function main() {
  console.log("Compiling contracts (solc wasm)...");
  const art = compileAll();

  const server = ganache.server({
    logging: { quiet: true },
    wallet: { mnemonic: "test test test test test test test test test test test junk", defaultBalance: 1_000_000 },
    chain: { chainId: 9043 },
    miner: { blockGasLimit: 30_000_000 },
  });
  await server.listen(8548);
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8548");
  const wallet = new ethers.NonceManager(await provider.getSigner(0));

  const deploy = async (name, args = []) => {
    const f = new ethers.ContractFactory(art[name].abi, art[name].bytecode, wallet);
    const c = await f.deploy(...args, TX);
    await c.waitForDeployment();
    return c;
  };

  const factory = await deploy("LifeloxDualFactory");
  const tokenA = await deploy("PXC20Token", ["Test USD", "TUS", ethers.parseEther("1000000")]);
  const tokenB = await deploy("PXC20Token", ["Test Gold", "TGOLD", ethers.parseEther("1000000")]);

  const cases = [
    ["solidity ↔ rust", solidityAsset(await tokenA.getAddress()), rustAsset(90909)],
    ["rust ↔ solidity (reversed input)", rustAsset(90909), solidityAsset(await tokenB.getAddress())],
    ["rust ↔ rust", rustAsset(919191), rustAsset(90909)],
    ["solidity ↔ solidity", solidityAsset(await tokenA.getAddress()), solidityAsset(await tokenB.getAddress())],
  ];

  const codeHash = await factory.pairCodeHash();
  const factoryAddr = await factory.getAddress();

  for (const [label, a, b] of cases) {
    // The factory hashes the pair the same way regardless of argument order…
    const h1 = await factory.pairHash(tuple(a), tuple(b));
    const h2 = await factory.pairHash(tuple(b), tuple(a));
    check(`${label}: pairHash is order-independent`, h1 === h2);

    check(`${label}: off-chain pairHash matches the factory`, pairHashOffChain(a, b) === h1);

    // The UI pushes Rust tokens to this address BEFORE the pair exists, so the
    // prediction has to be right to the byte.
    const predicted = predictPair(factoryAddr, codeHash, a, b);

    await (await factory.createPair(tuple(a), tuple(b), TX)).wait();
    const pairAddr = await factory.getPair(tuple(a), tuple(b));
    check(`${label}: pair created`, pairAddr !== ZERO);
    check(`${label}: UI predicted the pair address before deployment`, predicted === pairAddr);

    const pair = new ethers.Contract(pairAddr, art.LifeloxDualPair.abi, provider);
    const onChain0 = await pair.asset0();
    const expected0 = isFirst(a, b) ? a : b;

    const laneOk = Number(onChain0.lane) === expected0.lane;
    const idOk = BigInt(onChain0.id) === BigInt(expected0.id);
    const tokenOk = onChain0.token.toLowerCase() === expected0.token.toLowerCase();
    check(`${label}: UI picks the same token0 as the pair`, laneOk && idOk && tokenOk);
  }

  await server.close();
  console.log(`\n${passed}/${passed} checks passed — off-chain asset ordering matches the factory.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
