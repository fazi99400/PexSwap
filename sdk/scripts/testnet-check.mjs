// Live-testnet smoke check for the Lifelox integration.
//
// This is the one part that CANNOT be verified inside the repo sandbox — it must
// run against a real Pexli RPC. It proves the SDK's Rust-lane storage layout
// against the running chain: derive the slot with the SDK, read it via
// eth_getStorageAt, print the decoded balance.
//
//   node scripts/testnet-check.mjs --rpc https://your-pexli-rpc --id 1 --holder 0xYourAddr
//   (optional) --router 0xRouterAddr --amountIn 1000000000000000000 --path 0xTokenA,0xTokenB
import { createPublicClient, http, hexToBigInt } from "viem";
import { rustBalanceSlot } from "../dist/rustlane.js";
import { ROUTER_ABI } from "../dist/router.js";
import { PEXLI_CHAIN_ID, RUSTVM_ADDRESS, NS } from "../dist/constants.js";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const rpc = arg("rpc");
const id = BigInt(arg("id", "1"));
const holder = arg("holder");
const router = arg("router");
const amountIn = arg("amountIn");
const path = arg("path");

if (!rpc || !holder) {
  console.error("Usage: node scripts/testnet-check.mjs --rpc <url> --id <n> --holder 0x...");
  process.exit(1);
}

const client = createPublicClient({ transport: http(rpc) });

console.log(`RPC: ${rpc}`);
const chainId = await client.getChainId();
console.log(`chainId: ${chainId} ${chainId === PEXLI_CHAIN_ID ? "(Pexli ✓)" : `(expected ${PEXLI_CHAIN_ID} ✗)`}`);

const slot = rustBalanceSlot(id, holder, NS.PXC20);
console.log(`\nRust-lane PXC-20 balance read`);
console.log(`  RUSTVM : ${RUSTVM_ADDRESS}`);
console.log(`  id     : ${id}`);
console.log(`  holder : ${holder}`);
console.log(`  slot   : ${slot}`);
const raw = await client.getStorageAt({ address: RUSTVM_ADDRESS, slot });
const bal = raw && raw !== "0x" ? hexToBigInt(raw) : 0n;
console.log(`  raw    : ${raw}`);
console.log(`  balance: ${bal}`);

if (router && amountIn && path) {
  const p = path.split(",");
  const amounts = await client.readContract({
    address: router,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [BigInt(amountIn), p],
  });
  console.log(`\nrouter.getAmountsOut(${amountIn}, [${p.join(", ")}]) = [${amounts.join(", ")}]`);
}

console.log("\nDone. If chainId is Pexli and the balance matches the wallet UI, the layout is correct on your chain.");
