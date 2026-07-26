// Lifelox router — Uniswap-V2-style ABI + calldata builders.
//
// The router settles Solidity-lane PXC-20 tokens and native PEX. For a path
// that includes a Rust-lane token, see planSwap(): the Rust leg is settled with
// a RUSTVM op (rustlane.ts) and is flagged separately, because Rust-lane state
// is not an ERC-20 the router can transferFrom. This boundary is documented in
// INTEGRATION.md — nothing here pretends a Rust token is an ERC-20.

import { encodeFunctionData, numberToHex, type Address, type Hex } from "viem";
import type { TokenEntry } from "./tokenlist.js";
import { buildRustTransferTx } from "./rustlane.js";

export const ROUTER_ABI = [
  { type: "function", name: "getAmountsOut", stateMutability: "view",
    inputs: [{ name: "amountIn", type: "uint256" }, { name: "path", type: "address[]" }],
    outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "getAmountsIn", stateMutability: "view",
    inputs: [{ name: "amountOut", type: "uint256" }, { name: "path", type: "address[]" }],
    outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactTokensForTokens", stateMutability: "nonpayable",
    inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }],
    outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactETHForTokens", stateMutability: "payable",
    inputs: [{ name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }],
    outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactTokensForETH", stateMutability: "nonpayable",
    inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }],
    outputs: [{ name: "amounts", type: "uint256[]" }] },
] as const;

export interface Tx {
  to: Address;
  data: Hex;
  value: Hex;
}

export interface SwapParams {
  router: Address;
  tokenIn: TokenEntry;
  tokenOut: TokenEntry;
  amountIn: bigint;
  amountOutMin: bigint;
  /** Sorted address path (use WPEX for native legs). */
  path: Address[];
  to: Address;
  deadline: bigint;
}

const isNative = (t: TokenEntry) => t.standard === "native";
const isRust = (t: TokenEntry) => t.lane === "rust";

/** Build the single router transaction for a Solidity-lane / native swap. */
export function buildRouterSwapTx(p: SwapParams): Tx {
  const common = [p.amountOutMin, p.path, p.to, p.deadline] as const;
  if (isNative(p.tokenIn)) {
    return {
      to: p.router,
      data: encodeFunctionData({ abi: ROUTER_ABI, functionName: "swapExactETHForTokens", args: common }),
      value: numberToHex(p.amountIn),
    };
  }
  if (isNative(p.tokenOut)) {
    return {
      to: p.router,
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "swapExactTokensForETH",
        args: [p.amountIn, p.amountOutMin, p.path, p.to, p.deadline],
      }),
      value: "0x0",
    };
  }
  return {
    to: p.router,
    data: encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [p.amountIn, p.amountOutMin, p.path, p.to, p.deadline],
    }),
    value: "0x0",
  };
}

export interface SwapPlan {
  /** "router" = one atomic EVM tx. "rust-settlement" = Rust leg(s) + router. */
  kind: "router" | "rust-settlement";
  /** Ordered transactions the wallet signs and sends. */
  steps: Tx[];
  /** Set when a Rust-lane token is involved; see INTEGRATION.md. */
  requiresRustLane: boolean;
  notes?: string;
}

/**
 * Plan a swap. Pure Solidity-lane / native swaps return a single router tx
 * (kind "router"). If either side is a Rust-lane token, we return the RUSTVM
 * settlement op(s) plus the router leg and mark requiresRustLane, since the
 * router cannot transferFrom Rust-lane state — the wallet orchestrates the
 * Rust leg with an op-coded RUSTVM transaction. The exact on-chain routing
 * contract for Rust legs must be confirmed against the live pexli-stf.
 */
export function planSwap(p: SwapParams): SwapPlan {
  const rustLeg = isRust(p.tokenIn) || isRust(p.tokenOut);
  if (!rustLeg) {
    return { kind: "router", steps: [buildRouterSwapTx(p)], requiresRustLane: false };
  }

  const steps: Tx[] = [];
  // Move the Rust-lane input into the router as a RUSTVM op, then run the router.
  if (isRust(p.tokenIn) && p.tokenIn.id !== undefined) {
    steps.push(buildRustTransferTx(p.tokenIn.id, p.router, p.amountIn));
  }
  steps.push(buildRouterSwapTx(p));
  return {
    kind: "rust-settlement",
    steps,
    requiresRustLane: true,
    notes:
      "A Rust-lane token is involved. Step 1 moves it to the router via a RUSTVM " +
      "op; the router leg then settles the EVM side. Confirm the router's Rust-lane " +
      "acceptance against the live pexli-stf before relying on atomicity.",
  };
}
