import { useMemo, useState } from "react";
import { useAccount, useWriteContract, useReadContract, useReadContracts } from "wagmi";
import { readContract, sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import { maxUint256 } from "viem";
import { wagmiConfig } from "../config/wagmi";
import { NATIVE_PEX, SECOND_TOKEN, Token } from "../config/tokens";
import { ADDRESSES, ZERO_ADDRESS, isConfigured } from "../config/addresses";
import {
  ERC20_ABI,
  ROUTER_ABI,
  FACTORY_ABI,
  PAIR_ABI,
  DUAL_FACTORY_ABI,
  DUAL_ROUTER_ABI,
  WPEX_ABI,
} from "../config/abis";
import { fmt, parse, deadline, shortAddr } from "../lib/format";
import { TokenModal } from "../components/TokenModal";
import { useTokenList } from "../hooks/useTokenList";
import { TokenIcon, IconChevron, IconPlus, IconLayers } from "../components/Icons";
import { usePools, PoolInfo } from "../hooks/usePools";
import { useDualPair } from "../hooks/useDualPair";
import { assetArg, assetFor, sameAsset } from "../lib/dual";
import { RUSTVM_ADDRESS, U64_MAX, encodeRustTransfer } from "../lib/rustvm";

const isNative = (t: Token) => t.address === NATIVE_PEX.address;
const pairAddr = (t: Token): `0x${string}` => (isNative(t) ? ADDRESSES.wpex : t.address);

type View = "positions" | "new";

export function Pool() {
  const { address } = useAccount();
  const [view, setView] = useState<View>("new");

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="card-title">
        <h2>Pools</h2>
        <div className="segmented">
          <button className={view === "positions" ? "on" : ""} onClick={() => setView("positions")}>
            <IconLayers size={15} /> Positions
          </button>
          <button className={view === "new" ? "on" : ""} onClick={() => setView("new")}>
            <IconPlus size={15} /> New Position
          </button>
        </div>
      </div>

      {view === "positions" ? <Positions account={address} /> : <NewPosition />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Positions — every pool on the factory + your share                  */
/* ------------------------------------------------------------------ */
function Positions({ account }: { account?: `0x${string}` }) {
  const { pools, count, isLoading } = usePools(account);

  if (!isConfigured(ADDRESSES.factory)) {
    return <div className="empty">Set the deployed factory address in <code>.env</code> to load pools.</div>;
  }
  if (count === 0) {
    return (
      <div className="empty">
        {isLoading ? "Loading pools…" : <>No pools yet. Switch to <b>New Position</b> to create the first one.</>}
      </div>
    );
  }

  return (
    <>
      <div className="subtle modal-note" style={{ marginTop: 0 }}>
        Every pool on the factory, whoever created it — read live from the chain.
      </div>
      <div className="pool-list">
        {pools.map((p) => (
          <PoolRow key={p.pair} p={p} />
        ))}
      </div>
    </>
  );
}

/** Label for a pool side whose metadata could not be read at all. */
const sideLabel = (t?: Token, addr?: string) => t?.symbol ?? (addr ? shortAddr(addr) : "?");

function PoolRow({ p }: { p: PoolInfo }) {
  const share =
    p.totalSupply > 0n ? Number((p.lpBalance * 10000n) / p.totalSupply) / 100 : 0;
  const s0 = sideLabel(p.token0, p.token0Addr);
  const s1 = sideLabel(p.token1, p.token1Addr);
  const crossLane = p.token0?.lane === "rust" || p.token1?.lane === "rust";
  return (
    <div className="pool-row">
      <div className="pool-pair">
        <div className="pair-icons">
          {p.token0 && <TokenIcon token={p.token0} size={26} />}
          {p.token1 && <TokenIcon token={p.token1} size={26} />}
        </div>
        <div>
          <div className="pair-name">
            {s0} / {s1}
            {crossLane && <span className="lane-badge lane-rust" style={{ marginLeft: 6 }}>rust</span>}
          </div>
          <div className="subtle">
            {fmt(p.reserve0, p.token0?.decimals ?? 18, 2)} {s0} · {fmt(p.reserve1, p.token1?.decimals ?? 18, 2)} {s1}
          </div>
        </div>
      </div>
      <div className="pool-share">
        <div className="pair-name">{share > 0 ? `${share}%` : "—"}</div>
        <div className="subtle">your share</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* New Position — create a pool or add liquidity to an existing one     */
/* ------------------------------------------------------------------ */
function NewPosition() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { tokens: allTokens, importToken } = useTokenList();

  const [tokenA, setTokenA] = useState<Token>(NATIVE_PEX);
  const [tokenB, setTokenB] = useState<Token>(SECOND_TOKEN);
  const [amtA, setAmtA] = useState("");
  const [amtB, setAmtB] = useState("");
  const [picking, setPicking] = useState<null | "a" | "b">(null);
  const [status, setStatus] = useState<{ ok?: string; err?: string }>({});
  // Cross-lane liquidity needs several transactions — show which one is running.
  const [step, setStep] = useState("");

  const addrA = pairAddr(tokenA);
  const addrB = pairAddr(tokenB);

  // A Rust side cannot live on the EVM factory (it has no 0x contract), so those
  // pools go through the cross-lane factory/router in contracts/dual.
  const rustSide = tokenA.lane === "rust" || tokenB.lane === "rust";
  const dualDeployed = isConfigured(ADDRESSES.dualFactory) && isConfigured(ADDRESSES.dualRouter);
  const dualMode = rustSide && dualDeployed;

  const assetA = useMemo(() => assetFor(tokenA, ADDRESSES.wpex), [tokenA]);
  const assetB = useMemo(() => assetFor(tokenB, ADDRESSES.wpex), [tokenB]);
  const sameSide = rustSide ? sameAsset(assetA, assetB) : addrA === addrB;
  const dual = useDualPair(dualMode ? assetA : undefined, dualMode ? assetB : undefined);

  // Does the pool already exist?
  const { data: existingPair } = useReadContract({
    address: ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: "getPair",
    args: [addrA, addrB],
    query: { enabled: !rustSide && addrA !== addrB },
  });
  const poolAddr = (existingPair as `0x${string}` | undefined) ?? undefined;
  const poolExists =
    !!poolAddr && poolAddr !== "0x0000000000000000000000000000000000000000";

  // For an existing pool, read reserves + ordering so we can hold the ratio.
  const { data: poolData } = useReadContracts({
    contracts: poolExists
      ? [
          { address: poolAddr!, abi: PAIR_ABI, functionName: "getReserves" },
          { address: poolAddr!, abi: PAIR_ABI, functionName: "token0" },
        ]
      : [],
    query: { enabled: poolExists },
  });

  const ratioBperA = useMemo(() => {
    // Cross-lane pools keep their reserves on the dual pair.
    if (dualMode) {
      const r = dual.reserves;
      if (!r || r.a === 0n || r.b === 0n) return undefined;
      return { reserveA: r.a, reserveB: r.b };
    }
    if (!poolExists || !poolData) return undefined;
    const res = poolData[0]?.result as readonly [bigint, bigint, number] | undefined;
    const t0 = poolData[1]?.result as string | undefined;
    if (!res || !t0 || res[0] === 0n || res[1] === 0n) return undefined;
    const aIs0 = t0.toLowerCase() === addrA.toLowerCase();
    const reserveA = aIs0 ? res[0] : res[1];
    const reserveB = aIs0 ? res[1] : res[0];
    return { reserveA, reserveB };
  }, [dualMode, dual.reserves, poolExists, poolData, addrA]);

  // When adding to an existing pool, amount B is derived from amount A.
  function onAmtA(v: string) {
    const clean = v.replace(/[^0-9.]/g, "");
    setAmtA(clean);
    if (ratioBperA) {
      const a = parse(clean, tokenA.decimals);
      const b = ratioBperA.reserveA > 0n ? (a * ratioBperA.reserveB) / ratioBperA.reserveA : 0n;
      setAmtB(b === 0n ? "" : fmt(b, tokenB.decimals, 8));
    }
  }

  const amtAWei = parse(amtA, tokenA.decimals);
  const amtBWei = parse(amtB, tokenB.decimals);
  const creating = dualMode ? !dual.exists || !ratioBperA : !poolExists || !ratioBperA;

  // Rust-lane amounts are u64 on this chain — say so before the tx reverts.
  const overU64 =
    (tokenA.lane === "rust" && amtAWei > U64_MAX) || (tokenB.lane === "rust" && amtBWei > U64_MAX);

  // A native-PEX side in a cross-lane pool is wrapped to WPEX by the flow below,
  // so it only needs WPEX to actually be deployed.
  const nativeInDual = dualMode && (isNative(tokenA) || isNative(tokenB));
  const wpexMissing = nativeInDual && !isConfigured(ADDRESSES.wpex);

  const initialPrice =
    creating && amtAWei > 0n && amtBWei > 0n
      ? (Number(amtB) / Number(amtA)).toLocaleString(undefined, { maximumSignificantDigits: 6 })
      : undefined;

  async function approveIfNeeded(t: Token, amt: bigint, spender: `0x${string}` = ADDRESSES.router) {
    if (isNative(t) || t.lane === "rust") return;
    const a = await readAllowance(t.address, address!, spender);
    if (a < amt) {
      const hash = await writeContractAsync({
        address: t.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, maxUint256],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
    }
  }

  /** Allowance for the cross-lane router, where native PEX is really WPEX. */
  async function approveForDual(t: Token, amt: bigint) {
    if (t.lane === "rust") return; // nothing to approve on the Rust lane
    const token = isNative(t) ? ADDRESSES.wpex : t.address;
    const a = await readAllowance(token, address!, ADDRESSES.dualRouter);
    if (a < amt) {
      const hash = await writeContractAsync({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.dualRouter, maxUint256],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
    }
  }

  /**
   * Cross-lane liquidity. There is no `approve` on the Rust lane, so a Rust side
   * cannot be pulled: the holder pushes it to the pair first and the router
   * measures what arrived (Uniswap-V2 "transfer in, then call"). That makes this
   * a multi-step flow, and the pair must exist before we can push into it.
   */
  async function submitDual() {
    const dl = deadline(20);
    const sides = [
      [tokenA, amtAWei],
      [tokenB, amtBWei],
    ] as const;

    // 0. the cross-lane router moves ERC-20s only — it has no payable path, so
    //    native PEX has to become WPEX first.
    for (const [t, amt] of sides) {
      if (!isNative(t)) continue;
      setStep("Wrapping PEX…");
      const hash = await writeContractAsync({
        address: ADDRESSES.wpex,
        abi: WPEX_ABI,
        functionName: "deposit",
        value: amt,
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
    }

    // 1. the pair — created first so we have an address to push Rust tokens to.
    let pair = dual.pair;
    if (!pair) {
      setStep("Creating the pool…");
      const hash = await writeContractAsync({
        address: ADDRESSES.dualFactory,
        abi: DUAL_FACTORY_ABI,
        functionName: "createPair",
        args: [assetArg(assetA), assetArg(assetB)],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      pair = (await readContract(wagmiConfig, {
        address: ADDRESSES.dualFactory,
        abi: DUAL_FACTORY_ABI,
        functionName: "getPair",
        args: [assetArg(assetA), assetArg(assetB)],
      })) as `0x${string}`;
      if (!pair || pair === ZERO_ADDRESS) throw new Error("Pool was not created");
    }

    // 2. push each Rust side into the pair (a plain tx to the Rust-VM account).
    for (const [t, amt] of sides) {
      if (t.lane !== "rust") continue;
      setStep(`Sending ${t.symbol} to the pool…`);
      const hash = await sendTransaction(wagmiConfig, {
        to: RUSTVM_ADDRESS,
        data: encodeRustTransfer(BigInt(t.id ?? 0), pair, amt),
        value: 0n,
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
    }

    // 3. Solidity sides (WPEX included) are pulled by the router — allowance first.
    setStep("Approving…");
    await approveForDual(tokenA, amtAWei);
    await approveForDual(tokenB, amtBWei);

    // 4. mint the LP position.
    setStep(creating ? "Seeding the pool…" : "Adding liquidity…");
    const hash = await writeContractAsync({
      address: ADDRESSES.dualRouter,
      abi: DUAL_ROUTER_ABI,
      functionName: "addLiquidity",
      args: [assetArg(assetA), assetArg(assetB), amtAWei, amtBWei, address!, dl],
    });
    await waitForTransactionReceipt(wagmiConfig, { hash });
    await dual.refetchPair();
  }

  async function submit() {
    if (!address) return;
    setStatus({});
    const dl = deadline(20);
    const min = (x: bigint) => (x * 990n) / 1000n; // 1% tolerance on a new pool
    try {
      if (dualMode) {
        await submitDual();
        setStatus({ ok: creating ? "Pool created and seeded" : "Liquidity added" });
        setStep("");
        setAmtA("");
        setAmtB("");
        return;
      }

      await approveIfNeeded(tokenA, amtAWei);
      await approveIfNeeded(tokenB, amtBWei);

      if (isNative(tokenA) || isNative(tokenB)) {
        const token = isNative(tokenA) ? tokenB : tokenA;
        const tokenAmt = isNative(tokenA) ? amtBWei : amtAWei;
        const pexAmt = isNative(tokenA) ? amtAWei : amtBWei;
        await writeContractAsync({
          address: ADDRESSES.router,
          abi: ROUTER_ABI,
          functionName: "addLiquidityPEX",
          args: [token.address, tokenAmt, min(tokenAmt), min(pexAmt), address, dl],
          value: pexAmt,
        });
      } else {
        await writeContractAsync({
          address: ADDRESSES.router,
          abi: ROUTER_ABI,
          functionName: "addLiquidity",
          args: [tokenA.address, tokenB.address, amtAWei, amtBWei, min(amtAWei), min(amtBWei), address, dl],
        });
      }
      setStatus({ ok: creating ? "Pool created and seeded" : "Liquidity added" });
      setAmtA("");
      setAmtB("");
    } catch (e: any) {
      setStatus({ err: e?.shortMessage ?? e?.message ?? "Transaction failed" });
    } finally {
      setStep("");
    }
  }

  const blockedRust = rustSide && !dualDeployed;
  const disabled =
    !isConnected ||
    isPending ||
    !!step ||
    blockedRust ||
    wpexMissing ||
    overU64 ||
    amtAWei === 0n ||
    amtBWei === 0n ||
    sameSide;

  return (
    <>
      <div className={`pool-banner ${creating ? "create" : "add"}`}>
        {sameSide
          ? "Pick two different tokens."
          : blockedRust
          ? "Rust-lane pools need the cross-lane contracts: deploy them (npm run deploy:dual) and set VITE_LIFELOX_DUAL_FACTORY + VITE_LIFELOX_DUAL_ROUTER."
          : wpexMissing
          ? "Set VITE_WPEX — a cross-lane pool pools native PEX as WPEX."
          : nativeInDual && creating
          ? "New cross-lane pool. Your PEX is wrapped to WPEX first, then: the pair, the PXC push into it, and the liquidity."
          : overU64
          ? "Rust-lane amounts are u64 — lower the amount (or use 6–8 decimals for the Rust token)."
          : dualMode && creating
          ? "New cross-lane pool. Creating it takes a few transactions: the pair, the PXC push into it, then the liquidity."
          : creating
          ? "New pool — you are the first provider and set the initial price."
          : `Adding to the existing ${tokenA.symbol} / ${tokenB.symbol} pool. Amount is held to the current ratio.`}
      </div>

      <div className="field">
        <div className="field-top">
          <input className="amount-input" placeholder="0.0" inputMode="decimal" value={amtA} onChange={(e) => onAmtA(e.target.value)} />
          <button className="token-select" onClick={() => setPicking("a")}>
            <TokenIcon token={tokenA} size={24} />
            <span className="ts-sym">{tokenA.symbol}</span>
            <IconChevron size={15} />
          </button>
        </div>
      </div>

      <div className="swap-arrow static"><IconPlus size={18} /></div>

      <div className="field">
        <div className="field-top">
          <input
            className="amount-input"
            placeholder="0.0"
            inputMode="decimal"
            value={amtB}
            onChange={(e) => setAmtB(e.target.value.replace(/[^0-9.]/g, ""))}
            readOnly={!creating}
          />
          <button className="token-select" onClick={() => setPicking("b")}>
            <TokenIcon token={tokenB} size={24} />
            <span className="ts-sym">{tokenB.symbol}</span>
            <IconChevron size={15} />
          </button>
        </div>
      </div>

      {initialPrice && (
        <div className="info-row">
          <span>Initial price</span>
          <b>1 {tokenA.symbol} = {initialPrice} {tokenB.symbol}</b>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={submit} disabled={disabled}>
          {!isConnected
            ? "Connect wallet"
            : blockedRust
            ? "Cross-lane contracts not deployed"
            : wpexMissing
            ? "WPEX address not set"
            : step
            ? step
            : isPending
            ? "Confirming…"
            : amtAWei === 0n || amtBWei === 0n
            ? "Enter amounts"
            : creating
            ? "Create Pool"
            : "Add Liquidity"}
        </button>
      </div>

      {step && <div className="msg msg-ok">{step} Approve each transaction in your wallet.</div>}
      {status.err && <div className="msg msg-error">{status.err}</div>}
      {status.ok && <div className="msg msg-ok">{status.ok}</div>}

      {picking && (
        <TokenModal
          tokens={allTokens.filter((t) => (picking === "a" ? t.address !== tokenB.address : t.address !== tokenA.address))}
          onImport={importToken}
          onClose={() => setPicking(null)}
          onSelect={(t) => {
            if (picking === "a") setTokenA(t);
            else setTokenB(t);
            setAmtA("");
            setAmtB("");
            setPicking(null);
          }}
        />
      )}
    </>
  );
}

// Small imperative allowance read (outside React render).
async function readAllowance(token: `0x${string}`, owner: `0x${string}`, spender: `0x${string}`) {
  try {
    return (await readContract(wagmiConfig, {
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;
  } catch {
    return 0n;
  }
}
