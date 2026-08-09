import { useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { pexli, PEXLI_RPC_URL } from "../config/chain";
import { shortAddr } from "../lib/format";
import { IconWallet } from "./Icons";

// The Lifelox wallet announces itself via EIP-6963 with this rdns.
const LIFELOX_RDNS = "xyz.lifelox.wallet";

export function ConnectButton() {
  const { address, isConnected, connector } = useAccount();
  const { connect } = useConnect();
  const connectors = useConnectors();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const chainId = useChainId();

  // Prefer the Lifelox extension (EIP-6963), fall back to any injected wallet.
  function connectWallet() {
    const lifelox = connectors.find(
      (c) => c.id === LIFELOX_RDNS || c.name.toLowerCase() === "lifelox"
    );
    connect({ connector: lifelox ?? injected() });
  }

  // Add Pexli to the wallet (so the native coin shows as PEX, not ETH) and switch.
  async function addAndSwitchPexli() {
    try {
      await switchChainAsync({ chainId: pexli.id });
    } catch {
      // Unknown chain — add it explicitly, then it becomes the active network.
      const provider = (await connector?.getProvider()) as
        | { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
        | undefined;
      await provider?.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x" + pexli.id.toString(16),
            chainName: "Pexli",
            nativeCurrency: { name: "Pexli", symbol: "PEX", decimals: 18 },
            rpcUrls: [PEXLI_RPC_URL],
            blockExplorerUrls: [pexli.blockExplorers?.default.url].filter(Boolean),
          },
        ],
      });
    }
  }

  if (!isConnected) {
    return (
      <button className="btn btn-connect" onClick={connectWallet}>
        <IconWallet size={17} /> Connect Wallet
      </button>
    );
  }

  if (chainId !== pexli.id) {
    return (
      <button className="btn btn-primary" style={{ width: "auto" }} onClick={addAndSwitchPexli}>
        Add / Switch to Pexli
      </button>
    );
  }

  return (
    <button className="btn btn-ghost btn-account" onClick={() => disconnect()}>
      <span className="account-dot" /> {shortAddr(address)}
    </button>
  );
}
