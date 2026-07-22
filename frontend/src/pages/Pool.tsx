import { useState } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { maxUint256 } from "viem";
import { DEFAULT_TOKENS, NATIVE_PEX, Token } from "../config/tokens";
import { ADDRESSES } from "../config/addresses";
import { ERC20_ABI, ROUTER_ABI } from "../config/abis";
import { parse, deadline } from "../lib/format";
import { TokenModal } from "../components/TokenModal";
import { TokenIcon, IconChevron, IconPlus } from "../components/Icons";

const isNative = (t: Token) => t.address === NATIVE_PEX.address;

export function Pool() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const [tokenA, setTokenA] = useState<Token>(NATIVE_PEX);
  const [tokenB, setTokenB] = useState<Token>(DEFAULT_TOKENS[2]);
  const [amtA, setAmtA] = useState("");
  const [amtB, setAmtB] = useState("");
  const [picking, setPicking] = useState<null | "a" | "b">(null);
  const [status, setStatus] = useState<{ ok?: string; err?: string }>({});

  const amtAWei = parse(amtA, tokenA.decimals);
  const amtBWei = parse(amtB, tokenB.decimals);

  const allowB = useReadContract({
    address: tokenB.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address!, ADDRESSES.router],
    query: { enabled: !!address && !isNative(tokenB) },
  });
  const allowA = useReadContract({
    address: tokenA.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address!, ADDRESSES.router],
    query: { enabled: !!address && !isNative(tokenA) },
  });

  async function approve(t: Token) {
    await writeContractAsync({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.router, maxUint256],
    });
  }

  async function addLiquidity() {
    if (!address) return;
    setStatus({});
    const dl = deadline(20);
    const min = (x: bigint) => (x * 995n) / 1000n;
    try {
      // Approve non-native legs first.
      if (!isNative(tokenA) && (allowA.data ?? 0n) < amtAWei) await approve(tokenA);
      if (!isNative(tokenB) && (allowB.data ?? 0n) < amtBWei) await approve(tokenB);

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
      setStatus({ ok: "Liquidity added 🎉" });
      setAmtA("");
      setAmtB("");
    } catch (e: any) {
      setStatus({ err: e?.shortMessage ?? "Add liquidity failed" });
    }
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2>Add Liquidity</h2>
        <span className="subtle">Earn 0.30% of trades</span>
      </div>

      <div className="field">
        <div className="field-top">
          <input
            className="amount-input"
            placeholder="0.0"
            value={amtA}
            onChange={(e) => setAmtA(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          <button className="token-select" onClick={() => setPicking("a")}>
            <TokenIcon token={tokenA} size={24} />
            <span className="ts-sym">{tokenA.symbol}</span>
            <IconChevron size={15} />
          </button>
        </div>
      </div>

      <div className="swap-arrow"><IconPlus size={18} /></div>

      <div className="field">
        <div className="field-top">
          <input
            className="amount-input"
            placeholder="0.0"
            value={amtB}
            onChange={(e) => setAmtB(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          <button className="token-select" onClick={() => setPicking("b")}>
            <TokenIcon token={tokenB} size={24} />
            <span className="ts-sym">{tokenB.symbol}</span>
            <IconChevron size={15} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          onClick={addLiquidity}
          disabled={!isConnected || isPending || amtAWei === 0n || amtBWei === 0n}
        >
          {!isConnected
            ? "Connect wallet"
            : isPending
            ? "Confirming…"
            : amtAWei === 0n || amtBWei === 0n
            ? "Enter amounts"
            : "Add Liquidity"}
        </button>
      </div>

      {status.err && <div className="msg msg-error">{status.err}</div>}
      {status.ok && <div className="msg msg-ok">{status.ok}</div>}

      {picking && (
        <TokenModal
          tokens={DEFAULT_TOKENS.filter((t) =>
            picking === "a" ? t.symbol !== tokenB.symbol : t.symbol !== tokenA.symbol
          )}
          onClose={() => setPicking(null)}
          onSelect={(t) => {
            if (picking === "a") setTokenA(t);
            else setTokenB(t);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
