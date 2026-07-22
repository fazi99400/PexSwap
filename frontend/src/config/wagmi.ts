import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { pexli, PEXLI_RPC_URL } from "./chain";

// Injected (MetaMask / any EVM wallet) is enough for pexli-v2's EVM lane.
export const wagmiConfig = createConfig({
  chains: [pexli],
  connectors: [injected()],
  transports: {
    [pexli.id]: http(PEXLI_RPC_URL),
  },
});
