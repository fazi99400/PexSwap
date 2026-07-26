// Solidity-lane PXC-20 = standard ERC-20. Thin helpers for the wallet/DEX.

import { encodeFunctionData, hexToBigInt, type Address, type Hex } from "viem";

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "o", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "t", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/** Calldata to approve `spender` for `amount` of an ERC-20 token. */
export function encodeApprove(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, amount] });
}

/** Calldata for a plain ERC-20 transfer. */
export function encodeTransfer(to: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [to, amount] });
}

/** Decode a uint256 storage/return hex into bigint. */
export function toBig(hex?: Hex): bigint {
  return hex && hex !== "0x" ? hexToBigInt(hex) : 0n;
}
