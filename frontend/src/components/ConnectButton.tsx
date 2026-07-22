import { useAccount, useConnect, useDisconnect, useSwitchChain, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { pexli } from "../config/chain";
import { shortAddr } from "../lib/format";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();

  if (!isConnected) {
    return (
      <button className="btn btn-connect" onClick={() => connect({ connector: injected() })}>
        Connect Wallet
      </button>
    );
  }

  if (chainId !== pexli.id) {
    return (
      <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => switchChain({ chainId: pexli.id })}>
        Switch to Pexli v2
      </button>
    );
  }

  return (
    <button className="btn btn-ghost" onClick={() => disconnect()}>
      🟠 {shortAddr(address)}
    </button>
  );
}
