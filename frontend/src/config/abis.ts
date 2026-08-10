// Minimal ABIs the Lifelox UI needs. Kept inline so the frontend has no build
// dependency on the Solidity artifacts.

export const ERC20_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const ROUTER_ABI = [
  { type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ name: "amountIn", type: "uint256" }, { name: "path", type: "address[]" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "getAmountsIn", stateMutability: "view", inputs: [{ name: "amountOut", type: "uint256" }, { name: "path", type: "address[]" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactTokensForTokens", stateMutability: "nonpayable", inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactPEXForTokens", stateMutability: "payable", inputs: [{ name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  // ETH-named aliases (native = PEX) — the standard Uniswap-V2 names the Lifelox wallet calls.
  { type: "function", name: "swapExactETHForTokens", stateMutability: "payable", inputs: [{ name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactTokensForETH", stateMutability: "nonpayable", inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactTokensForPEX", stateMutability: "nonpayable", inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "addLiquidity", stateMutability: "nonpayable", inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "amountADesired", type: "uint256" }, { name: "amountBDesired", type: "uint256" }, { name: "amountAMin", type: "uint256" }, { name: "amountBMin", type: "uint256" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amountA", type: "uint256" }, { name: "amountB", type: "uint256" }, { name: "liquidity", type: "uint256" }] },
  { type: "function", name: "addLiquidityPEX", stateMutability: "payable", inputs: [{ name: "token", type: "address" }, { name: "amountTokenDesired", type: "uint256" }, { name: "amountTokenMin", type: "uint256" }, { name: "amountPEXMin", type: "uint256" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amountToken", type: "uint256" }, { name: "amountPEX", type: "uint256" }, { name: "liquidity", type: "uint256" }] },
] as const;

export const FACTORY_ABI = [
  { type: "function", name: "getPair", stateMutability: "view", inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }], outputs: [{ name: "pair", type: "address" }] },
  { type: "function", name: "allPairsLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allPairs", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

// Cross-lane (dual) factory + pair. A pool side here is an Asset — a lane tag
// plus either a 0x address (Solidity) or a numeric id (Rust) — not an address.
// WPEX — native PEX wrapped as an ERC-20. The cross-lane router only moves
// ERC-20s, so a native-PEX side has to be wrapped before it can be pooled.
export const WPEX_ABI = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "wad", type: "uint256" }], outputs: [] },
] as const;

const ASSET = (name: string) =>
  ({
    name,
    type: "tuple",
    components: [
      { name: "lane", type: "uint8" },
      { name: "token", type: "address" },
      { name: "id", type: "uint64" },
    ],
  }) as const;

export const DUAL_FACTORY_ABI = [
  { type: "function", name: "allPairsLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allPairs", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "getPair", stateMutability: "view", inputs: [ASSET("a"), ASSET("b")], outputs: [{ type: "address" }] },
  { type: "function", name: "createPair", stateMutability: "nonpayable", inputs: [ASSET("a"), ASSET("b")], outputs: [{ name: "pair", type: "address" }] },
  { type: "function", name: "pairHash", stateMutability: "pure", inputs: [ASSET("a"), ASSET("b")], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "pairCodeHash", stateMutability: "pure", inputs: [], outputs: [{ type: "bytes32" }] },
] as const;

export const DUAL_ROUTER_ABI = [
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getAmountOut", stateMutability: "pure", inputs: [{ name: "amountIn", type: "uint256" }, { name: "reserveIn", type: "uint256" }, { name: "reserveOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "addLiquidity", stateMutability: "payable", inputs: [ASSET("a"), ASSET("b"), { name: "amountA", type: "uint256" }, { name: "amountB", type: "uint256" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "liquidity", type: "uint256" }] },
  { type: "function", name: "swapExactInput", stateMutability: "payable", inputs: [ASSET("assetIn"), ASSET("assetOut"), { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }, { name: "unwrapPEX", type: "bool" }], outputs: [{ name: "amountOut", type: "uint256" }] },
] as const;

export const DUAL_PAIR_ABI = [
  { type: "function", name: "asset0", stateMutability: "view", inputs: [], outputs: [{ name: "lane", type: "uint8" }, { name: "token", type: "address" }, { name: "id", type: "uint64" }] },
  { type: "function", name: "asset1", stateMutability: "view", inputs: [], outputs: [{ name: "lane", type: "uint8" }, { name: "token", type: "address" }, { name: "id", type: "uint64" }] },
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ name: "reserve0", type: "uint112" }, { name: "reserve1", type: "uint112" }, { name: "blockTimestampLast", type: "uint32" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  // Removing liquidity is the low-level V2 way and identical on both pair types:
  // send the LP tokens back to the pair, then burn them to the owner.
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "burn", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [{ name: "amount0", type: "uint256" }, { name: "amount1", type: "uint256" }] },
] as const;

export const PAIR_ABI = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ name: "reserve0", type: "uint112" }, { name: "reserve1", type: "uint112" }, { name: "blockTimestampLast", type: "uint32" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  // Removing liquidity is the low-level V2 way and identical on both pair types:
  // send the LP tokens back to the pair, then burn them to the owner.
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "burn", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [{ name: "amount0", type: "uint256" }, { name: "amount1", type: "uint256" }] },
] as const;
