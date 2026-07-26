import { useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { pexli } from "../config/chain";
import { shortAddr } from "../lib/format";
import { IconWallet } from "./Icons";

// The Lifelox wallet announces itself via EIP-6963 with this rdns.
const LIFELOX_RDNS = "xyz.lifelox.wallet";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const connectors = useConnectors();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();

  // Prefer the Lifelox extension (EIP-6963), fall back to any injected wallet.
  function connectWallet() {
    const lifelox = connectors.find(
      (c) => c.id === LIFELOX_RDNS || c.name.toLowerCase() === "lifelox"
    );
    connect({ connector: lifelox ?? injected() });
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
      <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => switchChain({ chainId: pexli.id })}>
        Switch to Pexli
      </button>
    );
  }

  return (
    <button className="btn btn-ghost btn-account" onClick={() => disconnect()}>
      <span className="account-dot" /> {shortAddr(address)}
    </button>
  );
}
