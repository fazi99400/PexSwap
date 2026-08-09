import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useBalance,
} from "wagmi";
import { maxUint256 } from "viem";
import { DEFAULT_TOKENS, NATIVE_PEX, Token } from "../config/tokens";
import { ADDRESSES } from "../config/addresses";
import { ERC20_ABI, ROUTER_ABI } from "../config/abis";
import { fmt, parse, deadline } from "../lib/format";
import { TokenModal } from "../components/TokenModal";
import { useTokenList } from "../hooks/useTokenList";
import { TokenIcon, LaneMark, IconChevron, IconArrowDown, IconSettings } from "../components/Icons";

const isNative = (t: Token) => t.address === NATIVE_PEX.address;
// Native PEX routes through WPEX inside the pool path.
const pathAddr = (t: Token) => (isNative(t) ? ADDRESSES.wpex : t.address);

export function Swap() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { tokens: allTokens, importToken } = useTokenList();

  const [tokenIn, setTokenIn] = useState<Token>(NATIVE_PEX);
  const [tokenOut, setTokenOut] = useState<Token>(DEFAULT_TOKENS[2]);
  const [amountIn, setAmountIn] = useState("");
  const [picking, setPicking] = useState<null | "in" | "out">(null);
  const [status, setStatus] = useState<{ ok?: string; err?: string }>({});

  const amountInWei = parse(amountIn, tokenIn.decimals);
  const path = useMemo(() => [pathAddr(tokenIn), pathAddr(tokenOut)], [tokenIn, tokenOut]);

  // Quote: how much tokenOut for the given tokenIn.
  const { data: amounts } = useReadContract({
    address: ADDRESSES.router,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountInWei, path as `0x${string}`[]],
    query: { enabled: amountInWei > 0n && path[0] !== path[1] },
  });
  const amountOutWei = amounts?.[amounts.length - 1];

  // Balances.
  const nativeBal = useBalance({ address, query: { enabled: !!address } });
  const inBal = useReadContract({
    address: tokenIn.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address && !isNative(tokenIn) },
  });

  // Allowance (only for non-native input).
  const allowance = useReadContract({
    address: tokenIn.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address!, ADDRESSES.router],
    query: { enabled: !!address && !isNative(tokenIn) },
  });

  const needsApproval =
    !isNative(tokenIn) &&
    amountInWei > 0n &&
    (allowance.data ?? 0n) < amountInWei;

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
        args: [ADDRESSES.router, maxUint256],
      });
      await allowance.refetch();
      setStatus({ ok: `${tokenIn.symbol} approved` });
    } catch (e: any) {
      setStatus({ err: e?.shortMessage ?? "Approval failed" });
    }
  }

  async function handleSwap() {
    if (!address || !amountOutWei) return;
    setStatus({});
    const minOut = (amountOutWei * 995n) / 1000n; // 0.5% slippage tolerance
    const dl = deadline(20);
    try {
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
      setStatus({ err: e?.shortMessage ?? "Swap failed" });
    }
  }

  const balIn = isNative(tokenIn) ? nativeBal.data?.value : inBal.data;

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
        ) : needsApproval ? (
          <button className="btn btn-primary" onClick={handleApprove} disabled={isPending}>
            {isPending ? "Approving…" : `Approve ${tokenIn.symbol}`}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleSwap}
            disabled={isPending || !amountOutWei || amountInWei === 0n}
          >
            {isPending ? "Swapping…" : amountInWei === 0n ? "Enter an amount" : "Swap"}
          </button>
        )}
      </div>

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
