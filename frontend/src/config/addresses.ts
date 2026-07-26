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
} as const;

// The Rust-lane Lifelox program id (base58, Solana-style). Rust pools are
// discoverable/routable because they share block + state with the EVM lane.
export const RUST_PROGRAM_ID =
  import.meta.env.VITE_LIFELOX_RUST_PROGRAM ?? "Lifelox11111111111111111111111111111111111";
