// Deployed Lifelox contract addresses on the pexli-v2 EVM lane.
// Fill these in after running `contracts-solidity/scripts/deploy.js`.
// (Values below are placeholders — replace with your deployment output.)

export const ADDRESSES = {
  factory: (import.meta.env.VITE_LIFELOX_FACTORY ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  router: (import.meta.env.VITE_LIFELOX_ROUTER ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  wpex: (import.meta.env.VITE_WPEX ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  // Cross-lane factory + router (contracts/dual), deployed on the pexli testnet
  // (shard 1) after the network reset. Env wins, so a different deployment just
  // needs VITE_LIFELOX_DUAL_FACTORY / VITE_LIFELOX_DUAL_ROUTER.
  dualFactory: (import.meta.env.VITE_LIFELOX_DUAL_FACTORY ??
    "0x60a0d287C0d2584b8e585317d1264bF389cB894E") as `0x${string}`,
  dualRouter: (import.meta.env.VITE_LIFELOX_DUAL_ROUTER ??
    "0x596b93967Cc18539795437A17E689e775c2CCE93") as `0x${string}`,
} as const;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** An address is "configured" only if it is a real, non-zero address. */
export const isConfigured = (a?: string): a is `0x${string}` =>
  !!a && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0+$/.test(a);

// The Rust-lane Lifelox program id (base58, Solana-style). Rust pools are
// discoverable/routable because they share block + state with the EVM lane.
export const RUST_PROGRAM_ID =
  import.meta.env.VITE_LIFELOX_RUST_PROGRAM ?? "Lifelox11111111111111111111111111111111111";
