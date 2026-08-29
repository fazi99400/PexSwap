import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useWriteContract, useReadContract, useReadContracts, usePublicClient } from "wagmi";
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
  DUAL_PAIR_ABI,
} from "../config/abis";
import { fmt, fmtReserve, parse, deadline, shortAddr } from "../lib/format";
import { TokenModal } from "../components/TokenModal";
import { useTokenList } from "../hooks/useTokenList";
import { TokenIcon, IconChevron, IconPlus, IconLayers } from "../components/Icons";
import { usePools, PoolInfo } from "../hooks/usePools";
import { useDualPair } from "../hooks/useDualPair";
import { assetArg, assetFor, sameAsset } from "../lib/dual";
import { RUSTVM_ADDRESS, U64_MAX, encodeRustTransfer, fetchRustBalance } from "../lib/rustvm";

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
          <PoolRow key={p.pair} p={p} account={account} />
        ))}
      </div>
    </>
  );
}

/** Label for a pool side whose metadata could not be read at all. */
const sideLabel = (t?: Token, addr?: string) => t?.symbol ?? (addr ? shortAddr(addr) : "?");

function PoolRow({ p, account }: { p: PoolInfo; account?: `0x${string}` }) {
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const share =
    p.totalSupply > 0n ? Number((p.lpBalance * 10000n) / p.totalSupply) / 100 : 0;
  const s0 = sideLabel(p.token0, p.token0Addr);
  const s1 = sideLabel(p.token1, p.token1Addr);
  const crossLane = p.token0?.lane === "rust" || p.token1?.lane === "rust";
  const abi = p.source === "dual" ? DUAL_PAIR_ABI : PAIR_ABI;

  /**
   * Withdraw the whole position. Both pair types are Uniswap-V2 shaped, so the
   * low-level path works for either: send the LP tokens back to the pair, then
   * burn them — the pair pays each side out through its own lane. This is also
   * the way out of a pool that was seeded at the wrong ratio.
   */
  async function remove() {
    if (!account || p.lpBalance === 0n) return;
    setErr("");
    try {
      setBusy("Returning LP…");
      const send = await writeContractAsync({
        address: p.pair,
        abi,
        functionName: "transfer",
        args: [p.pair, p.lpBalance],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: send });

      setBusy("Withdrawing…");
      const burn = await writeContractAsync({
        address: p.pair,
        abi,
        functionName: "burn",
        args: [account],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: burn });
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? "Withdraw failed");
    } finally {
      setBusy("");
    }
  }

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
            {fmtReserve(p.reserve0, p.token0?.decimals ?? 18)} {s0} ·{" "}
            {fmtReserve(p.reserve1, p.token1?.decimals ?? 18)} {s1}
          </div>
          {err && <div className="msg msg-error">{err}</div>}
        </div>
      </div>
      <div className="pool-share">
        <div className="pair-name">{share > 0 ? `${share}%` : "—"}</div>
        <div className="subtle">your share</div>
        {p.lpBalance > 0n && (
          <button className="btn btn-ghost pool-remove" onClick={remove} disabled={!!busy}>
            {busy || "Withdraw"}
          </button>
        )}
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
  const publicClient = usePublicClient();

  const [tokenA, setTokenA] = useState<Token>(NATIVE_PEX);
  const [tokenB, setTokenB] = useState<Token>(SECOND_TOKEN);
  const [amtA, setAmtA] = useState("");
  const [amtB, setAmtB] = useState("");
  const [picking, setPicking] = useState<null | "a" | "b">(null);
  const [status, setStatus] = useState<{ ok?: string; err?: string }>({});
  // Cross-lane liquidity needs several transactions — show which one is running.
  const [step, setStep] = useState("");
  // A Rust side is a push the user signs, then a router call. The chain gives no
  // way to do both at once (the bridge moves PXC from the *caller*, and there is
  // no allowance on that lane), so the two steps are shown as two steps rather
  // than hidden behind one button that prompts twice.
  const [pushed, setPushed] = useState<{ pair: `0x${string}`; key: string } | null>(null);

  const addrA = pairAddr(tokenA);
  const addrB = pairAddr(tokenB);

  // A Rust side cannot live on the EVM factory (it has no 0x contract), so those
  // pools go through the cross-lane factory/router in contracts/dual.
  const rustSide = tokenA.lane === "rust" || tokenB.lane === "rust";
  const dualDeployed = isConfigured(ADDRESSES.dualFactory) && isConfigured(ADDRESSES.dualRouter);
  // Route EVERY pool through the cross-lane (dual) factory/router when deployed —
  // it pools Solidity, Rust and native PEX sides uniformly, so all four
  // combinations work with only the dual contracts. A rust side still needs the
  // two-signature push flow below (nothing can pull it).
  const dualMode = dualDeployed;

  const assetA = useMemo(() => assetFor(tokenA), [tokenA]);
  const assetB = useMemo(() => assetFor(tokenB), [tokenB]);
  const sameSide = sameAsset(assetA, assetB);
  const dual = useDualPair(dualMode ? assetA : undefined, dualMode ? assetB : undefined);

  // Does the pool already exist?
  const { data: existingPair } = useReadContract({
    address: ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: "getPair",
    args: [addrA, addrB],
    query: { enabled: !dualMode && addrA !== addrB },
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

  // What each Rust side really sends: the lane counts in base units and its
  // decimals come from the chain, so "22" can mean 22 whole tokens or 22 dust.
  const rustUnits = [
    [tokenA, amtAWei],
    [tokenB, amtBWei],
  ]
    .filter(([t, amt]) => (t as Token).lane === "rust" && (amt as bigint) > 0n)
    .map(([t, amt]) => ({
      symbol: (t as Token).symbol,
      decimals: (t as Token).decimals,
      units: (amt as bigint).toLocaleString(),
    }));

  // A Rust amount is a u64, so a token's decimals decide how much of it can ever
  // move: at 18 decimals the ceiling is ~18 whole tokens, which makes a pool
  // meaningless. Warn before the pool is seeded, not after the price looks insane.
  const rustCeiling = [tokenA, tokenB]
    .filter((t) => t.lane === "rust")
    .map((t) => ({ symbol: t.symbol, decimals: t.decimals, max: Number(U64_MAX) / 10 ** t.decimals }))
    .find((x) => x.max < 1000);

  // Identifies this exact deposit, so a completed step 1 is not credited to a
  // different pair or a changed amount.
  const dealKey = `${tokenA.address}:${amtA}|${tokenB.address}:${amtB}`;

  // A push that was signed but never followed by step 2 leaves the tokens at the
  // pair. They are not lost — step 2 still mints them — so find them and say so,
  // including after a reload, when component state is gone.
  const rustLeg = tokenA.lane === "rust" ? tokenA : tokenB.lane === "rust" ? tokenB : undefined;
  const { data: unclaimed, refetch: refetchUnclaimedQuery } = useQuery({
    queryKey: ["unclaimed-push", dual.pairAddress, rustLeg?.id],
    enabled: dualMode && !!publicClient && !!dual.pairAddress && !!rustLeg,
    queryFn: async () => {
      const sitting = await fetchRustBalance(publicClient!, BigInt(rustLeg!.id ?? 0), dual.pairAddress!);
      const reserve = dual.reserves ? (tokenA.lane === "rust" ? dual.reserves.a : dual.reserves.b) : 0n;
      return sitting > reserve ? sitting - reserve : 0n;
    },
    refetchInterval: 10000,
  });
  const refetchUnclaimed = async () => {
    await refetchUnclaimedQuery();
  };
  const stepOneDone = (!!pushed && pushed.key === dealKey) || (unclaimed ?? 0n) > 0n;

  const nativeInDual = dualMode && (isNative(tokenA) || isNative(tokenB));

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

  /** Allowance for the cross-lane router. Only an ERC-20 side is ever pulled. */
  async function approveForDual(t: Token, amt: bigint) {
    // Rust: nothing can pull it. PEX: paid as msg.value. Neither needs approve.
    if (t.lane === "rust" || isNative(t)) return;
    const token = t.address;
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
   * Step 1 of a cross-lane deposit: the user sends the Rust side to the pair.
   *
   * This cannot be folded into the router call. A transaction has one
   * destination and therefore one lane, the bridge moves PXC from the *caller*,
   * and the Rust lane has no allowance — so nothing but the holder can move
   * these tokens. Two signatures is the chain's floor, not a UI shortcut.
   *
   * The pair does not have to exist yet: its CREATE2 address is known in
   * advance, and the router deploys it when it mints.
   */
  async function pushRustSides() {
    const pair = dual.pairAddress;
    if (!pair) throw new Error("Could not resolve the pool address");

    for (const [t, amt] of [
      [tokenA, amtAWei],
      [tokenB, amtBWei],
    ] as const) {
      if (t.lane !== "rust") continue;
      setStep(`Sending ${t.symbol}…`);
      const hash = await sendTransaction(wagmiConfig, {
        to: RUSTVM_ADDRESS,
        data: encodeRustTransfer(BigInt(t.id ?? 0), pair, amt),
        value: 0n,
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
    }
    setPushed({ pair, key: dealKey });
    await refetchUnclaimed();
  }

  /**
   * Step 2: the router creates the pair if needed, takes the Solidity/PEX side,
   * and mints. The pair measures what actually arrived for every side (V2
   * "transfer in, then call"), so the amounts passed here are a request, not a
   * claim — a push that landed short still mints against the real balance.
   */
  async function finishDual() {
    const dl = deadline(20);

    setStep("Approving…");
    await approveForDual(tokenA, amtAWei);
    await approveForDual(tokenB, amtBWei);

    setStep(creating ? "Creating and seeding the pool…" : "Adding liquidity…");
    const pexValue = isNative(tokenA) ? amtAWei : isNative(tokenB) ? amtBWei : 0n;
    const hash = await writeContractAsync({
      address: ADDRESSES.dualRouter,
      abi: DUAL_ROUTER_ABI,
      functionName: "addLiquidity",
      args: [assetArg(assetA), assetArg(assetB), amtAWei, amtBWei, address!, dl],
      value: pexValue,
    });
    await waitForTransactionReceipt(wagmiConfig, { hash });
    setPushed(null);
    await dual.refetchPair();
    await refetchUnclaimed();
  }

  /** Run one of the two cross-lane steps, with the shared status handling. */
  async function runStep(fn: () => Promise<void>, done: string) {
    if (!address) return;
    setStatus({});
    try {
      await fn();
      setStatus({ ok: done });
    } catch (e: any) {
      setStatus({ err: e?.shortMessage ?? e?.message ?? "Transaction failed" });
    } finally {
      setStep("");
    }
  }

  async function submit() {
    if (!address) return;
    setStatus({});
    const dl = deadline(20);
    const min = (x: bigint) => (x * 990n) / 1000n; // 1% tolerance on a new pool
    try {
      if (dualMode) {
        // No Rust side, so the whole thing is one router call.
        await finishDual();
        setStatus({ ok: creating ? "Pool created and seeded" : "Liquidity added" });
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
          : overU64
          ? "Rust-lane amounts are u64 — lower the amount (or use 6–8 decimals for the Rust token)."
          : dualMode
          ? "A Rust side takes two signatures: you send the PXC to the pool, then the router adds the liquidity. Nothing can move PXC on your behalf, so this cannot be one transaction."
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

      {/* Everything on the Rust lane is counted in base units, and the decimals
          come from the chain — so spell out what will actually be sent. A pool
          seeded with a dust amount is what produces those absurd prices. */}
      {rustUnits.map((u) => (
        <div className="info-row" key={u.symbol}>
          <span>{u.symbol} sent as</span>
          <b>
            {u.units} base units {u.decimals > 0 && <span className="subtle">({u.decimals} decimals)</span>}
          </b>
        </div>
      ))}

      {rustCeiling && (
        <div className="msg msg-error">
          {rustCeiling.symbol} has {rustCeiling.decimals} decimals, and a Rust-lane transfer is
          a u64 — so at most{" "}
          {rustCeiling.max.toLocaleString(undefined, { maximumSignificantDigits: 4 })} of it can
          ever move. A pool on this token can only ever hold dust; 6–8 decimals is the workable
          range on this lane.
        </div>
      )}

      {initialPrice && (
        <div className="info-row">
          <span>Initial price</span>
          <b>1 {tokenA.symbol} = {initialPrice} {tokenB.symbol}</b>
        </div>
      )}

      {rustSide && dualDeployed ? (
        <div className="steps" style={{ marginTop: 12 }}>
          <div className={`step-row ${stepOneDone ? "done" : ""}`}>
            <span className="step-num">1</span>
            <div className="step-body">
              <div className="step-title">Send the PXC to the pool</div>
              <div className="subtle">
                {stepOneDone
                  ? `${fmt(unclaimed ?? 0n, rustLeg?.decimals ?? 0, 8)} ${rustLeg?.symbol ?? ""} is waiting at the pool`
                  : "A transfer only you can sign — the Rust lane has no allowance."}
              </div>
            </div>
            <button
              className="btn btn-ghost step-btn"
              onClick={() => runStep(pushRustSides, "Sent — now add the liquidity")}
              disabled={disabled || stepOneDone}
            >
              {step && !stepOneDone ? step : stepOneDone ? "Sent" : "Send"}
            </button>
          </div>

          <div className={`step-row ${stepOneDone ? "" : "waiting"}`}>
            <span className="step-num">2</span>
            <div className="step-body">
              <div className="step-title">{creating ? "Create the pool" : "Add the liquidity"}</div>
              <div className="subtle">
                {stepOneDone ? "One router call — it mints your LP." : "Enabled once step 1 confirms."}
              </div>
            </div>
            <button
              className="btn btn-primary step-btn"
              onClick={() =>
                runStep(finishDual, creating ? "Pool created and seeded" : "Liquidity added")
              }
              disabled={!isConnected || !!step || !stepOneDone}
            >
              {step && stepOneDone ? step : creating ? "Create Pool" : "Add Liquidity"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={submit} disabled={disabled}>
            {!isConnected
              ? "Connect wallet"
              : blockedRust
              ? "Cross-lane contracts not deployed"
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
      )}

      {step && <div className="msg msg-ok">{step} Approve the transaction in your wallet.</div>}
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
