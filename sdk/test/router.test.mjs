import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData } from "viem";
import { ROUTER_ABI, buildRouterSwapTx, planSwap } from "../dist/router.js";
import { validateTokenList } from "../dist/tokenlist.js";
import { RUSTVM_ADDRESS } from "../dist/constants.js";

const ROUTER = "0x9999999999999999999999999999999999999999";
const TO = "0xabc0000000000000000000000000000000000abc";
const WPEX = "0x000000000000000000000000000000000000dEaD";

const PEX = { symbol: "PEX", name: "Pexli", lane: "solidity", standard: "native", address: "0x0000000000000000000000000000000000000000", decimals: 18 };
const USDP = { symbol: "USDP", name: "Pexli USD", lane: "solidity", standard: "PXC-20", address: "0x00000000000000000000000000000000000000AA", decimals: 18 };
const RUST = { symbol: "RGOLD", name: "Rust Gold", lane: "rust", standard: "PXC-20", id: 7, decimals: 8 };

const base = { router: ROUTER, amountIn: 1000n, amountOutMin: 900n, to: TO, deadline: 111n };

test("native in -> swapExactETHForTokens with value", () => {
  const tx = buildRouterSwapTx({ ...base, tokenIn: PEX, tokenOut: USDP, path: [WPEX, USDP.address] });
  const d = decodeFunctionData({ abi: ROUTER_ABI, data: tx.data });
  assert.equal(d.functionName, "swapExactETHForTokens");
  assert.equal(BigInt(tx.value), 1000n);
});

test("native out -> swapExactTokensForETH, zero value", () => {
  const tx = buildRouterSwapTx({ ...base, tokenIn: USDP, tokenOut: PEX, path: [USDP.address, WPEX] });
  const d = decodeFunctionData({ abi: ROUTER_ABI, data: tx.data });
  assert.equal(d.functionName, "swapExactTokensForETH");
  assert.equal(tx.value, "0x0");
});

test("token->token -> swapExactTokensForTokens", () => {
  const tx = buildRouterSwapTx({ ...base, tokenIn: USDP, tokenOut: USDP, path: [USDP.address, WPEX] });
  const d = decodeFunctionData({ abi: ROUTER_ABI, data: tx.data });
  assert.equal(d.functionName, "swapExactTokensForTokens");
});

test("planSwap: all-EVM path is a single router tx", () => {
  const plan = planSwap({ ...base, tokenIn: PEX, tokenOut: USDP, path: [WPEX, USDP.address] });
  assert.equal(plan.kind, "router");
  assert.equal(plan.requiresRustLane, false);
  assert.equal(plan.steps.length, 1);
});

test("planSwap: rust-lane input adds a RUSTVM settlement step first", () => {
  const plan = planSwap({ ...base, tokenIn: RUST, tokenOut: USDP, path: [WPEX, USDP.address] });
  assert.equal(plan.kind, "rust-settlement");
  assert.equal(plan.requiresRustLane, true);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].to, RUSTVM_ADDRESS); // Rust leg settles on the RUSTVM
});

test("token list validates", () => {
  validateTokenList({
    name: "Lifelox",
    chainId: 78901,
    version: { major: 1, minor: 0, patch: 0 },
    tokens: [PEX, USDP, RUST],
  });
});
