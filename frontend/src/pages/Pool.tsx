import { useMemo, useState } from "react";
import { useAccount, useWriteContract, useReadContract, useReadContracts } from "wagmi";
import { readContract } from "wagmi/actions";
import { maxUint256 } from "viem";
import { wagmiConfig } from "../config/wagmi";
import { DEFAULT_TOKENS, NATIVE_PEX, Token } from "../config/tokens";
import { ADDRESSES } from "../config/addresses";
import { ERC20_ABI, ROUTER_ABI, FACTORY_ABI, PAIR_ABI } from "../config/abis";
import { fmt, parse, deadline } from "../lib/format";
import { TokenModal } from "../components/TokenModal";
import { useTokenList } from "../hooks/useTokenList";
import { TokenIcon, IconChevron, IconPlus, IconLayers } from "../components/Icons";
import { usePools, PoolInfo } from "../hooks/usePools";

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
  const { pools, count } = usePools(account);

  if (ADDRESSES.factory === "0x0000000000000000000000000000000000000000") {
    return <div className="empty">Set the deployed factory address in <code>.env</code> to load pools.</div>;
  }
  if (count === 0) {
    return (
      <div className="empty">
        No pools yet. Switch to <b>New Position</b> to create the first one.
      </div>
    );
  }

  return (
    <div className="pool-list">
      {pools.map((p) => (
        <PoolRow key={p.pair} p={p} />
      ))}
    </div>
  );
}

function PoolRow({ p }: { p: PoolInfo }) {
  const share =
    p.totalSupply > 0n ? Number((p.lpBalance * 10000n) / p.totalSupply) / 100 : 0;
  const s0 = p.token0?.symbol ?? "?";
  const s1 = p.token1?.symbol ?? "?";
  return (
    <div className="pool-row">
      <div className="pool-pair">
        <div className="pair-icons">
          {p.token0 && <TokenIcon token={p.token0} size={26} />}
          {p.token1 && <TokenIcon token={p.token1} size={26} />}
        </div>
        <div>
          <div className="pair-name">{s0} / {s1}</div>
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
  const [tokenB, setTokenB] = useState<Token>(DEFAULT_TOKENS[2]);
  const [amtA, setAmtA] = useState("");
  const [amtB, setAmtB] = useState("");
  const [picking, setPicking] = useState<null | "a" | "b">(null);
  const [status, setStatus] = useState<{ ok?: string; err?: string }>({});

  const addrA = pairAddr(tokenA);
  const addrB = pairAddr(tokenB);

  // Does the pool already exist?
  const { data: existingPair } = useReadContract({
    address: ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: "getPair",
    args: [addrA, addrB],
    query: { enabled: addrA !== addrB },
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
    if (!poolExists || !poolData) return undefined;
    const res = poolData[0]?.result as readonly [bigint, bigint, number] | undefined;
    const t0 = poolData[1]?.result as string | undefined;
    if (!res || !t0 || res[0] === 0n || res[1] === 0n) return undefined;
    const aIs0 = t0.toLowerCase() === addrA.toLowerCase();
    const reserveA = aIs0 ? res[0] : res[1];
    const reserveB = aIs0 ? res[1] : res[0];
    return { reserveA, reserveB };
  }, [poolExists, poolData, addrA]);

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
  const creating = !poolExists || !ratioBperA;

  const initialPrice =
    creating && amtAWei > 0n && amtBWei > 0n
      ? (Number(amtB) / Number(amtA)).toLocaleString(undefined, { maximumSignificantDigits: 6 })
      : undefined;

  async function approveIfNeeded(t: Token, amt: bigint) {
    if (isNative(t)) return;
    const a = await readAllowance(t.address, address!, ADDRESSES.router);
    if (a < amt) {
      await writeContractAsync({
        address: t.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.router, maxUint256],
      });
    }
  }

  async function submit() {
    if (!address) return;
    setStatus({});
    const dl = deadline(20);
    const min = (x: bigint) => (x * 990n) / 1000n; // 1% tolerance on a new pool
    try {
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
      setStatus({ err: e?.shortMessage ?? "Transaction failed" });
    }
  }

  const disabled = !isConnected || isPending || amtAWei === 0n || amtBWei === 0n || addrA === addrB;

  return (
    <>
      <div className={`pool-banner ${creating ? "create" : "add"}`}>
        {addrA === addrB
          ? "Pick two different tokens."
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
            : isPending
            ? "Confirming…"
            : amtAWei === 0n || amtBWei === 0n
            ? "Enter amounts"
            : creating
            ? "Create Pool"
            : "Add Liquidity"}
        </button>
      </div>

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
