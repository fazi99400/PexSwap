/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PEXLI_CHAIN_ID?: string;
  readonly VITE_PEXLI_RPC_URL?: string;
  readonly VITE_PEXLI_EXPLORER?: string;
  readonly VITE_LIFELOX_FACTORY?: string;
  readonly VITE_LIFELOX_ROUTER?: string;
  readonly VITE_WPEX?: string;
  readonly VITE_LIFELOX_RUST_PROGRAM?: string;
  readonly VITE_TOKEN_USDP?: string;
  readonly VITE_TOKEN_PXLI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
