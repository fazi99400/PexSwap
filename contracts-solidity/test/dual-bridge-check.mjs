// Live-testnet check for the Rust-lane bridge precompile (0x…0e13).
// Proves reads work before you rely on a pool built on top of them (prompt §6).
// This must run against the real chain; it cannot be faked locally.
//
//   node test/dual-bridge-check.mjs --rpc https://testrpc.pex.li --id 90909 --holder 0xYourAddr
import { ethers } from "ethers";

const BRIDGE = "0x0000000000000000000000000000000000000e13";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const rpc = arg("rpc", "https://testrpc.pex.li");
const id = BigInt(arg("id", "90909"));
const holder = arg("holder");

const id8 = ethers.toBeHex(id, 8); // 8-byte big-endian id
const sel = (s) => ethers.concat([s, id8]);
const b32ToStr = (hex) => {
  const b = ethers.getBytes(hex);
  let end = b.length;
  for (let i = 0; i < b.length; i++) if (b[i] === 0) { end = i; break; }
  return ethers.toUtf8String(b.slice(0, end));
};

const provider = new ethers.JsonRpcProvider(rpc);

console.log(`RPC ${rpc}  ·  bridge ${BRIDGE}  ·  id ${id}`);
console.log(`chainId ${(await provider.getNetwork()).chainId}\n`);

const decHex = await provider.call({ to: BRIDGE, data: sel("0x01") });
const symHex = await provider.call({ to: BRIDGE, data: sel("0x02") });
const nameHex = await provider.call({ to: BRIDGE, data: sel("0x03") });
const decimals = Number(BigInt(decHex));
console.log(`name     : ${JSON.stringify(b32ToStr(nameHex))}`);
console.log(`symbol   : ${JSON.stringify(b32ToStr(symHex))}`);
console.log(`decimals : ${decimals}${decimals === 0 ? "  (no metadata / or truly 0)" : ""}`);

if (holder) {
  const balHex = await provider.call({
    to: BRIDGE,
    data: ethers.concat(["0x20", id8, ethers.zeroPadValue(holder, 20)]),
  });
  const bal = BigInt(balHex);
  console.log(`\nbalance of ${holder}: ${bal} base units` + (decimals ? ` = ${ethers.formatUnits(bal, decimals)}` : ""));
}

console.log("\nIf name/symbol/decimals look right, the bridge reads work on your chain.");
console.log("Next: deploy the dual AMM (scripts/deploy-dual.mjs) and create a pool.");
