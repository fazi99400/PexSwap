import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ADDRESSES, ZERO_ADDRESS, isConfigured } from "../config/addresses";
import { DUAL_FACTORY_ABI, DUAL_PAIR_ABI } from "../config/abis";
import { Asset, assetArg, isFirst, predictPair } from "../lib/dual";

/** The cross-lane pool for (a, b): its address, whether it exists yet, and the
 *  reserves already flipped into (a, b) order. */
export function useDualPair(a?: Asset, b?: Asset) {
  const ready = isConfigured(ADDRESSES.dualFactory) && !!a && !!b;

  const { data: pairData, refetch } = useReadContract({
    address: ADDRESSES.dualFactory,
    abi: DUAL_FACTORY_ABI,
    functionName: "getPair",
    args: ready ? [assetArg(a!), assetArg(b!)] : undefined,
    query: { enabled: ready },
  });

  const pair = pairData as `0x${string}` | undefined;
  const exists = !!pair && pair !== ZERO_ADDRESS;

  // The pair's CREATE2 address is knowable before it is deployed, which is what
  // lets a Rust side be pushed into it first (see lib/dual.ts).
  const { data: codeHash } = useReadContract({
    address: ADDRESSES.dualFactory,
    abi: DUAL_FACTORY_ABI,
    functionName: "pairCodeHash",
    query: { enabled: ready, staleTime: Infinity },
  });
  const predicted =
    ready && codeHash ? predictPair(ADDRESSES.dualFactory, codeHash as `0x${string}`, a!, b!) : undefined;

  const { data: state } = useReadContracts({
    contracts: exists
      ? [
          { address: pair!, abi: DUAL_PAIR_ABI, functionName: "getReserves" },
          { address: pair!, abi: DUAL_PAIR_ABI, functionName: "totalSupply" },
        ]
      : [],
    query: { enabled: exists, refetchInterval: 8000 },
  });

  const reserves = useMemo(() => {
    const res = state?.[0]?.result as readonly [bigint, bigint, number] | undefined;
    if (!res || !a || !b) return undefined;
    // The pair stores reserves in key order; present them as (a, b).
    const aIs0 = isFirst(a, b);
    return { a: aIs0 ? res[0] : res[1], b: aIs0 ? res[1] : res[0] };
  }, [state, a, b]);

  return {
    ready,
    pair: exists ? pair : undefined,
    /** Address the pair has (or will have) — safe to send tokens to either way. */
    pairAddress: exists ? pair : predicted,
    exists,
    reserves,
    totalSupply: (state?.[1]?.result as bigint | undefined) ?? 0n,
    refetchPair: refetch,
  };
}
