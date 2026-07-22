import { defineChain } from "viem";

// pexli-v2: a dual-VM L1 that runs Rust and Solidity contracts in the SAME block
// against one shared SMT state, with ZK validity proofs. The EVM lane speaks
// standard eth_* JSON-RPC, so viem/wagmi connect exactly like any EVM chain.
export const PEXLI_CHAIN_ID = Number(
  import.meta.env.VITE_PEXLI_CHAIN_ID ?? 9042
);

export const PEXLI_RPC_URL =
  import.meta.env.VITE_PEXLI_RPC_URL ?? "http://127.0.0.1:8545";

export const pexli = defineChain({
  id: PEXLI_CHAIN_ID,
  name: "Pexli v2",
  nativeCurrency: { name: "Pexli", symbol: "PEX", decimals: 18 },
  rpcUrls: {
    default: { http: [PEXLI_RPC_URL] },
    public: { http: [PEXLI_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "Pexli Explorer",
      url: import.meta.env.VITE_PEXLI_EXPLORER ?? "http://127.0.0.1:3000",
    },
  },
  testnet: true,
});
