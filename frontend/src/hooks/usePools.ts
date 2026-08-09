import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ADDRESSES } from "../config/addresses";
import { FACTORY_ABI, PAIR_ABI } from "../config/abis";
import { DEFAULT_TOKENS, Token } from "../config/tokens";

export interface PoolInfo {
  pair: `0x${string}`;
  token0?: Token & { addr: `0x${string}` };
  token1?: Token & { addr: `0x${string}` };
  /** Raw on-chain addresses, present even for tokens not in the default list. */
  token0Addr?: `0x${string}`;
  token1Addr?: `0x${string}`;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  lpBalance: bigint;
}

function findToken(addr?: string): (Token & { addr: `0x${string}` }) | undefined {
  if (!addr) return undefined;
  const lower = addr.toLowerCase();
  const t =
    DEFAULT_TOKENS.find((x) => x.address.toLowerCase() === lower) ??
    // WPEX shows as "PEX" side visually
    DEFAULT_TOKENS.find((x) => x.symbol === "WPEX" && x.address.toLowerCase() === lower);
  return t ? { ...t, addr: addr as `0x${string}` } : undefined;
}

/** Reads every pool from the factory and hydrates reserves + the user's LP balance. */
export function usePools(account?: `0x${string}`) {
  const { data: lenData } = useReadContract({
    address: ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: "allPairsLength",
    query: { refetchInterval: 8000 },
  });
  const count = lenData ? Number(lenData) : 0;

  // Stage 1: pair addresses by index.
  const { data: pairAddrs } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: ADDRESSES.factory,
      abi: FACTORY_ABI,
      functionName: "allPairs",
      args: [BigInt(i)],
    })),
    query: { enabled: count > 0 },
  });

  const pairs = useMemo(
    () => (pairAddrs ?? []).map((r) => r.result as `0x${string}` | undefined).filter(Boolean) as `0x${string}`[],
    [pairAddrs]
  );

  // Stage 2: token0/token1/reserves/totalSupply/lpBalance per pair.
  const { data: details, isLoading } = useReadContracts({
    contracts: pairs.flatMap((p) => [
      { address: p, abi: PAIR_ABI, functionName: "token0" },
      { address: p, abi: PAIR_ABI, functionName: "token1" },
      { address: p, abi: PAIR_ABI, functionName: "getReserves" },
      { address: p, abi: PAIR_ABI, functionName: "totalSupply" },
      { address: p, abi: PAIR_ABI, functionName: "balanceOf", args: [account ?? "0x0000000000000000000000000000000000000000"] },
    ]),
    query: { enabled: pairs.length > 0 },
  });

  const pools: PoolInfo[] = useMemo(() => {
    if (!details) return [];
    const out: PoolInfo[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const base = i * 5;
      const t0 = details[base]?.result as string | undefined;
      const t1 = details[base + 1]?.result as string | undefined;
      const res = details[base + 2]?.result as readonly [bigint, bigint, number] | undefined;
      const ts = details[base + 3]?.result as bigint | undefined;
      const lp = details[base + 4]?.result as bigint | undefined;
      out.push({
        pair: pairs[i],
        token0: findToken(t0),
        token1: findToken(t1),
        token0Addr: t0 as `0x${string}` | undefined,
        token1Addr: t1 as `0x${string}` | undefined,
        reserve0: res?.[0] ?? 0n,
        reserve1: res?.[1] ?? 0n,
        totalSupply: ts ?? 0n,
        lpBalance: lp ?? 0n,
      });
    }
    return out;
  }, [details, pairs]);

  return { pools, count, isLoading };
}
