import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useBalance,
  usePublicClient,
} from "wagmi";
import { readContract, sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import { useQuery } from "@tanstack/react-query";
import { maxUint256 } from "viem";
import { wagmiConfig } from "../config/wagmi";
import { NATIVE_PEX, SECOND_TOKEN, Token } from "../config/tokens";
import { ADDRESSES, isConfigured } from "../config/addresses";
import { ERC20_ABI, ROUTER_ABI, DUAL_ROUTER_ABI } from "../config/abis";
import { fmt, parse, deadline } from "../lib/format";
import { TokenModal } from "../components/TokenModal";
import { useTokenList } from "../hooks/useTokenList";
import { TokenIcon, LaneMark, IconChevron, IconArrowDown, IconSettings } from "../components/Icons";
import { useDualPair } from "../hooks/useDualPair";
import { assetArg, assetFor } from "../lib/dual";
import { RUSTVM_ADDRESS, U64_MAX, encodeRustTransfer, fetchRustBalance } from "../lib/rustvm";

/** Uniswap-V2 constant-product quote with the 0.30% fee — the same formula the
 *  routers implement on-chain, so a cross-lane quote needs no extra RPC call. */
function amountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint | undefined {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return undefined;
  const inWithFee = amountIn * 997n;
  return (inWithFee * reserveOut) / (reserveIn * 1000n + inWithFee);
}

const isNative = (t: Token) => t.address === NATIVE_PEX.address;
// Native PEX routes through WPEX inside the pool path.
const pathAddr = (t: Token) => (isNative(t) ? ADDRESSES.wpex : t.address);

export function Swap() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { tokens: allTokens, importToken } = useTokenList();

  const [tokenIn, setTokenIn] = useState<Token>(NATIVE_PEX);
  const [tokenOut, setTokenOut] = useState<Token>(SECOND_TOKEN);
  const [amountIn, setAmountIn] = useState("");
  const [picking, setPicking] = useState<null | "in" | "out">(null);
  const [status, setStatus] = useState<{ ok?: string; err?: string }>({});
  // A cross-lane swap runs in more than one transaction — show which one.
  const [step, setStep] = useState("");
  const publicClient = usePublicClient();

  const amountInWei = parse(amountIn, tokenIn.decimals);
  const path = useMemo(() => [pathAddr(tokenIn), pathAddr(tokenOut)], [tokenIn, tokenOut]);

  // A rust-lane side has no ERC-20 contract, so the EVM router cannot touch it —
  // those swaps go through the cross-lane router (docs/RUST-POOLS.md).
  const rustSide = tokenIn.lane === "rust" || tokenOut.lane === "rust";
  const dualDeployed = isConfigured(ADDRESSES.dualFactory) && isConfigured(ADDRESSES.dualRouter);
  const dualMode = rustSide && dualDeployed;

  const assetIn = useMemo(() => assetFor(tokenIn, ADDRESSES.wpex), [tokenIn]);
  const assetOut = useMemo(() => assetFor(tokenOut, ADDRESSES.wpex), [tokenOut]);
  const dual = useDualPair(dualMode ? assetIn : undefined, dualMode ? assetOut : undefined);

  // Quote: how much tokenOut for the given tokenIn.
  const { data: amounts } = useReadContract({
    address: ADDRESSES.router,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountInWei, path as `0x${string}`[]],
    query: { enabled: amountInWei > 0n && path[0] !== path[1] && !rustSide },
  });
  // Cross-lane quote comes off the dual pair's reserves (same x·y=k, same fee).
  const dualOut = useMemo(
    () => (dualMode && dual.reserves ? amountOut(amountInWei, dual.reserves.a, dual.reserves.b) : undefined),
    [dualMode, dual.reserves, amountInWei]
  );
  const amountOutWei = dualMode ? dualOut : amounts?.[amounts.length - 1];

  // Balances. A rust token's balance is a RUSTVM storage read, not balanceOf.
  const nativeBal = useBalance({ address, query: { enabled: !!address } });
  const inBal = useReadContract({
    address: tokenIn.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address && !isNative(tokenIn) && tokenIn.lane !== "rust" },
  });
  const { data: rustBal } = useQuery({
    queryKey: ["rust-balance", tokenIn.id, address],
    enabled: tokenIn.lane === "rust" && !!address && !!publicClient,
    queryFn: () => fetchRustBalance(publicClient!, BigInt(tokenIn.id ?? 0), address!),
    refetchInterval: 8000,
  });

  // Allowance — only a Solidity input is ever pulled, and by whichever router
  // will settle this swap.
  const spender = dualMode ? ADDRESSES.dualRouter : ADDRESSES.router;
  const allowance = useReadContract({
    address: tokenIn.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address!, spender],
    query: { enabled: !!address && !isNative(tokenIn) && tokenIn.lane !== "rust" },
  });

  const needsApproval =
    !isNative(tokenIn) &&
    tokenIn.lane !== "rust" &&
    amountInWei > 0n &&
    (allowance.data ?? 0n) < amountInWei;

  const overU64 = tokenIn.lane === "rust" && amountInWei > U64_MAX;
  const blockedRust = rustSide && !dualDeployed;
  // The cross-lane router has no payable path — it cannot wrap/unwrap native PEX.
  const nativeInDual = dualMode && (isNative(tokenIn) || isNative(tokenOut));

  const priceImpactLabel = useMemo(() => {
    if (!amountOutWei || amountInWei === 0n) return "—";
    return "0.30% fee";
  }, [amountOutWei, amountInWei]);

  function flip() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
  }

  async function handleApprove() {
    setStatus({});
    try {
      await writeContractAsync({
        address: tokenIn.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, maxUint256],
      });
      await allowance.refetch();
      setStatus({ ok: `${tokenIn.symbol} approved` });
    } catch (e: any) {
      setStatus({ err: e?.shortMessage ?? "Approval failed" });
    }
  }

  /**
   * Cross-lane swap. A Rust input cannot be pulled (no approve on that lane), so
   * it is pushed to the pair first and the router measures what arrived; a
   * Solidity input is pulled by the router as usual.
   */
  async function swapDual(minOut: bigint, dl: bigint) {
    if (tokenIn.lane === "rust") {
      if (!dual.pair) throw new Error("No pool for this pair yet");
      setStep(`Sending ${tokenIn.symbol} to the pool…`);
      const push = await sendTransaction(wagmiConfig, {
        to: RUSTVM_ADDRESS,
        data: encodeRustTransfer(BigInt(tokenIn.id ?? 0), dual.pair, amountInWei),
        value: 0n,
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: push });
    } else {
      const current = (await readContract(wagmiConfig, {
        address: tokenIn.address,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address!, ADDRESSES.dualRouter],
      })) as bigint;
      if (current < amountInWei) {
        setStep("Approving…");
        const hash = await writeContractAsync({
          address: tokenIn.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.dualRouter, maxUint256],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash });
      }
    }

    setStep("Swapping…");
    const hash = await writeContractAsync({
      address: ADDRESSES.dualRouter,
      abi: DUAL_ROUTER_ABI,
      functionName: "swapExactInput",
      args: [assetArg(assetIn), assetArg(assetOut), amountInWei, minOut, address!, dl],
    });
    await waitForTransactionReceipt(wagmiConfig, { hash });
  }

  async function handleSwap() {
    if (!address || !amountOutWei) return;
    setStatus({});
    const minOut = (amountOutWei * 995n) / 1000n; // 0.5% slippage tolerance
    const dl = deadline(20);
    try {
      if (dualMode) {
        await swapDual(minOut, dl);
        setStatus({ ok: "Swap complete 🎉" });
        setAmountIn("");
        return;
      }

      if (isNative(tokenIn)) {
        await writeContractAsync({
          address: ADDRESSES.router,
          abi: ROUTER_ABI,
          functionName: "swapExactPEXForTokens",
          args: [minOut, path as `0x${string}`[], address, dl],
          value: amountInWei,
        });
      } else if (isNative(tokenOut)) {
        await writeContractAsync({
          address: ADDRESSES.router,
          abi: ROUTER_ABI,
          functionName: "swapExactTokensForPEX",
          args: [amountInWei, minOut, path as `0x${string}`[], address, dl],
        });
      } else {
        await writeContractAsync({
          address: ADDRESSES.router,
          abi: ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [amountInWei, minOut, path as `0x${string}`[], address, dl],
        });
      }
      setStatus({ ok: "Swap submitted 🎉" });
      setAmountIn("");
    } catch (e: any) {
      setStatus({ err: e?.shortMessage ?? e?.message ?? "Swap failed" });
    } finally {
      setStep("");
    }
  }

  const balIn = isNative(tokenIn)
    ? nativeBal.data?.value
    : tokenIn.lane === "rust"
    ? rustBal
    : inBal.data;

  return (
    <div className="card">
      <div className="card-title">
        <h2>Swap</h2>
        <div className="card-title-right">
          <span className="pill-tag">pexli-v2 · 0.30% fee</span>
          <span className="icon-btn" aria-label="Settings"><IconSettings size={17} /></span>
        </div>
      </div>

      {/* From */}
      <div className="field">
        <div className="field-top">
          <input
            className="amount-input"
            placeholder="0.0"
            inputMode="decimal"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          <button className="token-select" onClick={() => setPicking("in")}>
            <TokenIcon token={tokenIn} size={24} />
            <span className="ts-sym">{tokenIn.symbol}</span>
            <span className={`lane-badge lane-${tokenIn.lane}`}><LaneMark lane={tokenIn.lane} /></span>
            <IconChevron size={15} />
          </button>
        </div>
        <div className="field-bottom subtle">
          <span>From</span>
          <span>Balance: {fmt(balIn, tokenIn.decimals)}</span>
        </div>
      </div>

      <div className="swap-arrow" onClick={flip} role="button" aria-label="Flip"><IconArrowDown size={18} /></div>

      {/* To */}
      <div className="field">
        <div className="field-top">
          <input
            className="amount-input"
            placeholder="0.0"
            value={amountOutWei ? fmt(amountOutWei, tokenOut.decimals) : ""}
            readOnly
          />
          <button className="token-select" onClick={() => setPicking("out")}>
            <TokenIcon token={tokenOut} size={24} />
            <span className="ts-sym">{tokenOut.symbol}</span>
            <span className={`lane-badge lane-${tokenOut.lane}`}><LaneMark lane={tokenOut.lane} /></span>
            <IconChevron size={15} />
          </button>
        </div>
        <div className="field-bottom subtle">
          <span>To (estimated)</span>
        </div>
      </div>

      {amountOutWei ? (
        <div className="info-row">
          <span>Rate</span>
          <b>{priceImpactLabel}</b>
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        {!isConnected ? (
          <button className="btn btn-primary" disabled>
            Connect wallet to swap
          </button>
        ) : blockedRust ? (
          <button className="btn btn-primary" disabled>
            Cross-lane contracts not deployed
          </button>
        ) : nativeInDual ? (
          <button className="btn btn-primary" disabled>
            Use WPEX, not native PEX
          </button>
        ) : overU64 ? (
          <button className="btn btn-primary" disabled>
            Amount too large for the Rust lane (u64)
          </button>
        ) : dualMode && !dual.exists ? (
          <button className="btn btn-primary" disabled>
            No pool for this pair yet
          </button>
        ) : needsApproval && !dualMode ? (
          <button className="btn btn-primary" onClick={handleApprove} disabled={isPending}>
            {isPending ? "Approving…" : `Approve ${tokenIn.symbol}`}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleSwap}
            disabled={isPending || !!step || !amountOutWei || amountInWei === 0n}
          >
            {step || (isPending ? "Swapping…" : amountInWei === 0n ? "Enter an amount" : "Swap")}
          </button>
        )}
      </div>

      {step && <div className="msg msg-ok">{step} Approve each transaction in your wallet.</div>}
      {status.err && <div className="msg msg-error">{status.err}</div>}
      {status.ok && <div className="msg msg-ok">{status.ok}</div>}

      {picking && (
        <TokenModal
          tokens={allTokens.filter((t) =>
            picking === "in" ? t.address !== tokenOut.address : t.address !== tokenIn.address
          )}
          onImport={importToken}
          onClose={() => setPicking(null)}
          onSelect={(t) => {
            if (picking === "in") setTokenIn(t);
            else setTokenOut(t);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
