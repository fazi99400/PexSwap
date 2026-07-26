require("@nomicfoundation/hardhat-toolbox");

// Lifelox deploys to the pexli-v2 chain, which runs Rust + Solidity contracts in the
// same block. The EVM lane speaks standard eth_* JSON-RPC, so Hardhat works unchanged.
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const PEXLI_RPC_URL = process.env.PEXLI_RPC_URL || "http://127.0.0.1:8545";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 999999 },
    },
  },
  networks: {
    pexliTestnet: {
      url: PEXLI_RPC_URL,
      chainId: Number(process.env.PEXLI_CHAIN_ID || 78901),
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
};
