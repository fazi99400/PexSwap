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
  // Cross-lane factory (contracts/dual). Optional: leave unset and the UI simply
  // lists the EVM-lane pools. When set, Rust-lane pools show up alongside them.
  dualFactory: (import.meta.env.VITE_LIFELOX_DUAL_FACTORY ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
} as const;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** An address is "configured" only if it is a real, non-zero address. */
export const isConfigured = (a?: string): a is `0x${string}` =>
  !!a && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0+$/.test(a);

// The Rust-lane Lifelox program id (base58, Solana-style). Rust pools are
// discoverable/routable because they share block + state with the EVM lane.
export const RUST_PROGRAM_ID =
  import.meta.env.VITE_LIFELOX_RUST_PROGRAM ?? "Lifelox11111111111111111111111111111111111";
