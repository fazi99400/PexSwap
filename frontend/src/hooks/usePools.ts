import { useEffect, useMemo } from "react";
import { useReadContract, useReadContracts, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ADDRESSES, ZERO_ADDRESS, isConfigured } from "../config/addresses";
import { FACTORY_ABI, PAIR_ABI, DUAL_FACTORY_ABI, DUAL_PAIR_ABI, ERC20_ABI } from "../config/abis";
import { colorForAddress, DEFAULT_TOKENS, Token } from "../config/tokens";
import { detectRustToken, rustKey, rustTokenFrom } from "../lib/rustvm";
import { registerDiscoveredTokens } from "./useTokenList";

// Pools are read from the factories, never from local state — so a pool ANY user
// creates is visible to EVERY visitor. Tokens that are not in the built-in list
// are hydrated straight off the chain (ERC-20 name/symbol/decimals on the EVM
// lane, the bridge precompile on the Rust lane) instead of rendering as "?", and
// are published to the shared token list so they appear in the pickers too.

export interface PoolInfo {
  pair: `0x${string}`;
  /** Which factory the pool came from: the EVM core factory or the cross-lane one. */
  source: "core" | "dual";
  token0?: Token;
  token1?: Token;
  /** Identity of each side: the 0x address, or the synthetic key of a rust id. */
  token0Addr?: `0x${string}`;
  token1Addr?: `0x${string}`;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  lpBalance: bigint;
}

/** A pool side before metadata is attached. */
type Ref =
  | { lane: "solidity"; address: `0x${string}` }
  | { lane: "rust"; id: bigint };

const refKey = (r: Ref): string =>
  (r.lane === "solidity" ? r.address : rustKey(r.id)).toLowerCase();

interface RawPool {
  pair: `0x${string}`;
  source: "core" | "dual";
  ref0?: Ref;
  ref1?: Ref;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  lpBalance: bigint;
}

function defaultToken(addr: string): Token | undefined {
  const lower = addr.toLowerCase();
  return DEFAULT_TOKENS.find((x) => x.address.toLowerCase() === lower);
}

/** Reads every pool from both factories and hydrates reserves, token metadata
 *  and the user's LP balance. */
export function usePools(account?: `0x${string}`) {
  const publicClient = usePublicClient();
  const holder = account ?? ZERO_ADDRESS;
  const hasCore = isConfigured(ADDRESSES.factory);
  const hasDual = isConfigured(ADDRESSES.dualFactory);

  /* ---- EVM core factory ------------------------------------------------ */
  const { data: lenData } = useReadContract({
    address: ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: "allPairsLength",
    query: { enabled: hasCore, refetchInterval: 8000 },
  });
  const coreCount = lenData ? Number(lenData) : 0;

  const { data: pairAddrs } = useReadContracts({
    contracts: Array.from({ length: coreCount }, (_, i) => ({
      address: ADDRESSES.factory,
      abi: FACTORY_ABI,
      functionName: "allPairs",
      args: [BigInt(i)],
    })),
    query: { enabled: coreCount > 0 },
  });

  const pairs = useMemo(
    () => (pairAddrs ?? []).map((r) => r.result as `0x${string}` | undefined).filter(Boolean) as `0x${string}`[],
    [pairAddrs]
  );

  const { data: details, isLoading } = useReadContracts({
    contracts: pairs.flatMap((p) => [
      { address: p, abi: PAIR_ABI, functionName: "token0" },
      { address: p, abi: PAIR_ABI, functionName: "token1" },
      { address: p, abi: PAIR_ABI, functionName: "getReserves" },
      { address: p, abi: PAIR_ABI, functionName: "totalSupply" },
      { address: p, abi: PAIR_ABI, functionName: "balanceOf", args: [holder] },
    ]),
    query: { enabled: pairs.length > 0, refetchInterval: 8000 },
  });

  /* ---- cross-lane (dual) factory, when deployed ------------------------ */
  const { data: dualLenData } = useReadContract({
    address: ADDRESSES.dualFactory,
    abi: DUAL_FACTORY_ABI,
    functionName: "allPairsLength",
    query: { enabled: hasDual, refetchInterval: 8000 },
  });
  const dualCount = dualLenData ? Number(dualLenData) : 0;

  const { data: dualPairAddrs } = useReadContracts({
    contracts: Array.from({ length: dualCount }, (_, i) => ({
      address: ADDRESSES.dualFactory,
      abi: DUAL_FACTORY_ABI,
      functionName: "allPairs",
      args: [BigInt(i)],
    })),
    query: { enabled: dualCount > 0 },
  });

  const dualPairs = useMemo(
    () =>
      (dualPairAddrs ?? []).map((r) => r.result as `0x${string}` | undefined).filter(Boolean) as `0x${string}`[],
    [dualPairAddrs]
  );

  const { data: dualDetails, isLoading: dualLoading } = useReadContracts({
    contracts: dualPairs.flatMap((p) => [
      { address: p, abi: DUAL_PAIR_ABI, functionName: "asset0" },
      { address: p, abi: DUAL_PAIR_ABI, functionName: "asset1" },
      { address: p, abi: DUAL_PAIR_ABI, functionName: "getReserves" },
      { address: p, abi: DUAL_PAIR_ABI, functionName: "totalSupply" },
      { address: p, abi: DUAL_PAIR_ABI, functionName: "balanceOf", args: [holder] },
    ]),
    query: { enabled: dualPairs.length > 0, refetchInterval: 8000 },
  });

  /* ---- one list of raw pools ------------------------------------------- */
  const raw: RawPool[] = useMemo(() => {
    const out: RawPool[] = [];

    if (details) {
      for (let i = 0; i < pairs.length; i++) {
        const base = i * 5;
        const t0 = details[base]?.result as `0x${string}` | undefined;
        const t1 = details[base + 1]?.result as `0x${string}` | undefined;
        const res = details[base + 2]?.result as readonly [bigint, bigint, number] | undefined;
        out.push({
          pair: pairs[i],
          source: "core",
          ref0: t0 ? { lane: "solidity", address: t0 } : undefined,
          ref1: t1 ? { lane: "solidity", address: t1 } : undefined,
          reserve0: res?.[0] ?? 0n,
          reserve1: res?.[1] ?? 0n,
          totalSupply: (details[base + 3]?.result as bigint | undefined) ?? 0n,
          lpBalance: (details[base + 4]?.result as bigint | undefined) ?? 0n,
        });
      }
    }

    if (dualDetails) {
      // asset(lane, token, id): lane 0 = Solidity (use `token`), 1 = Rust (use `id`).
      const asRef = (a?: readonly [number, `0x${string}`, bigint]): Ref | undefined => {
        if (!a) return undefined;
        return Number(a[0]) === 1 ? { lane: "rust", id: BigInt(a[2]) } : { lane: "solidity", address: a[1] };
      };
      for (let i = 0; i < dualPairs.length; i++) {
        const base = i * 5;
        const a0 = dualDetails[base]?.result as readonly [number, `0x${string}`, bigint] | undefined;
        const a1 = dualDetails[base + 1]?.result as readonly [number, `0x${string}`, bigint] | undefined;
        const res = dualDetails[base + 2]?.result as readonly [bigint, bigint, number] | undefined;
        out.push({
          pair: dualPairs[i],
          source: "dual",
          ref0: asRef(a0),
          ref1: asRef(a1),
          reserve0: res?.[0] ?? 0n,
          reserve1: res?.[1] ?? 0n,
          totalSupply: (dualDetails[base + 3]?.result as bigint | undefined) ?? 0n,
          lpBalance: (dualDetails[base + 4]?.result as bigint | undefined) ?? 0n,
        });
      }
    }

    return out;
  }, [details, pairs, dualDetails, dualPairs]);

  /* ---- hydrate the sides that are not in the built-in token list -------- */
  const unknown = useMemo(() => {
    const evm: `0x${string}`[] = [];
    const rust: bigint[] = [];
    const seen = new Set<string>();
    for (const p of raw) {
      for (const ref of [p.ref0, p.ref1]) {
        if (!ref) continue;
        const k = refKey(ref);
        if (seen.has(k)) continue;
        seen.add(k);
        if (ref.lane === "rust") rust.push(ref.id);
        else if (!defaultToken(ref.address)) evm.push(ref.address);
      }
    }
    return { evm, rust };
  }, [raw]);

  const { data: evmMeta } = useReadContracts({
    contracts: unknown.evm.flatMap((a) => [
      { address: a, abi: ERC20_ABI, functionName: "symbol" },
      { address: a, abi: ERC20_ABI, functionName: "name" },
      { address: a, abi: ERC20_ABI, functionName: "decimals" },
    ]),
    query: { enabled: unknown.evm.length > 0 },
  });

  const rustIdsKey = unknown.rust.join(",");
  const { data: rustMeta } = useQuery({
    queryKey: ["pool-rust-meta", rustIdsKey],
    enabled: unknown.rust.length > 0 && !!publicClient,
    queryFn: async () =>
      Promise.all(
        unknown.rust.map(async (id) => {
          const info = await detectRustToken(publicClient!, id);
          return rustTokenFrom(info ?? { id, symbol: "", name: "", decimals: 0, hasMetadata: false });
        })
      ),
  });

  /** address (or rust key) -> token, defaults first then whatever the chain says. */
  const tokenByKey = useMemo(() => {
    const map = new Map<string, Token>();
    for (const t of DEFAULT_TOKENS) map.set(t.address.toLowerCase(), t);

    unknown.evm.forEach((addr, i) => {
      const base = i * 3;
      const symbol = evmMeta?.[base]?.result as string | undefined;
      const name = evmMeta?.[base + 1]?.result as string | undefined;
      const decimals = evmMeta?.[base + 2]?.result as number | undefined;
      if (!symbol || decimals === undefined) return; // not an ERC-20 we can read
      map.set(addr.toLowerCase(), {
        address: addr,
        symbol,
        name: name || symbol,
        decimals: Number(decimals),
        lane: "solidity",
        color: colorForAddress(addr),
      });
    });

    for (const t of rustMeta ?? []) map.set(t.address.toLowerCase(), t);
    return map;
  }, [unknown, evmMeta, rustMeta]);

  const pools: PoolInfo[] = useMemo(
    () =>
      raw.map((p) => {
        const k0 = p.ref0 ? refKey(p.ref0) : undefined;
        const k1 = p.ref1 ? refKey(p.ref1) : undefined;
        return {
          pair: p.pair,
          source: p.source,
          token0: k0 ? tokenByKey.get(k0) : undefined,
          token1: k1 ? tokenByKey.get(k1) : undefined,
          token0Addr: k0 as `0x${string}` | undefined,
          token1Addr: k1 as `0x${string}` | undefined,
          reserve0: p.reserve0,
          reserve1: p.reserve1,
          totalSupply: p.totalSupply,
          lpBalance: p.lpBalance,
        };
      }),
    [raw, tokenByKey]
  );

  // Publish pooled tokens to the shared list: anything with a pool is visible to
  // everyone, no import needed. (WPEX stays out — the UI shows it as native PEX.)
  const discovered = useMemo(() => {
    const wpex = ADDRESSES.wpex.toLowerCase();
    const out: Token[] = [];
    const seen = new Set<string>();
    for (const p of pools) {
      for (const t of [p.token0, p.token1]) {
        if (!t) continue;
        const k = t.address.toLowerCase();
        if (k === wpex || seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
    }
    return out;
  }, [pools]);

  const discoveredKey = discovered.map((t) => t.address.toLowerCase()).sort().join(",");
  useEffect(() => {
    if (discovered.length) registerDiscoveredTokens(discovered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveredKey]);

  return { pools, count: coreCount + dualCount, isLoading: isLoading || dualLoading };
}
