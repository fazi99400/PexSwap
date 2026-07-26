// Wallet connection for Lifelox — EIP-6963 discovery with EIP-1193 fallback.
//
// Discovers the "Lifelox" provider announced via EIP-6963 (rdns
// "xyz.lifelox.wallet"), connects with eth_requestAccounts, verifies the chain
// is Pexli (78901), and wires accountsChanged / chainChanged.

import { PEXLI_CHAIN_ID, LIFELOX_WALLET_RDNS, LIFELOX_WALLET_NAME } from "./constants.js";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

type WindowLike = {
  addEventListener: (t: string, l: (e: any) => void) => void;
  removeEventListener: (t: string, l: (e: any) => void) => void;
  dispatchEvent: (e: any) => boolean;
  ethereum?: Eip1193Provider;
  CustomEvent?: typeof CustomEvent;
};

const getWin = (win?: WindowLike): WindowLike | undefined =>
  win ?? (typeof window !== "undefined" ? (window as unknown as WindowLike) : undefined);

/**
 * Collect all EIP-6963 providers currently announcing. Resolves after a short
 * tick so wallets have time to respond to the request event.
 */
export function discoverProviders(win?: WindowLike, waitMs = 300): Promise<Eip6963ProviderDetail[]> {
  const w = getWin(win);
  return new Promise((resolve) => {
    if (!w) return resolve([]);
    const found = new Map<string, Eip6963ProviderDetail>();
    const onAnnounce = (event: any) => {
      const detail = event.detail as Eip6963ProviderDetail;
      if (detail?.info?.uuid) found.set(detail.info.uuid, detail);
    };
    w.addEventListener("eip6963:announceProvider", onAnnounce);
    const Evt = w.CustomEvent ?? (globalThis as any).CustomEvent;
    w.dispatchEvent(new Evt("eip6963:requestProvider"));
    setTimeout(() => {
      w.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve([...found.values()]);
    }, waitMs);
  });
}

/**
 * Find the Lifelox provider: prefer the EIP-6963 rdns match, then a name match,
 * then fall back to window.ethereum (single-provider wallets).
 */
export async function getLifeloxProvider(win?: WindowLike, waitMs = 300): Promise<Eip1193Provider | undefined> {
  const details = await discoverProviders(win, waitMs);
  const byRdns = details.find((d) => d.info.rdns === LIFELOX_WALLET_RDNS);
  if (byRdns) return byRdns.provider;
  const byName = details.find((d) => d.info.name === LIFELOX_WALLET_NAME);
  if (byName) return byName.provider;
  return getWin(win)?.ethereum; // EIP-1193 fallback
}

export interface ConnectResult {
  provider: Eip1193Provider;
  address: `0x${string}`;
  chainId: number;
  onChainWrong: boolean;
}

/** Connect: request accounts, read chainId, flag if not Pexli. */
export async function connectLifelox(win?: WindowLike): Promise<ConnectResult> {
  const provider = await getLifeloxProvider(win);
  if (!provider) throw new Error("Lifelox wallet not found. Install it or open in the Lifelox in-app browser.");

  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.length) throw new Error("No account authorized.");
  const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
  const chainId = Number(chainHex);

  return {
    provider,
    address: accounts[0] as `0x${string}`,
    chainId,
    onChainWrong: chainId !== PEXLI_CHAIN_ID,
  };
}

/** Ask the wallet to switch to Pexli (78901). */
export async function switchToPexli(provider: Eip1193Provider): Promise<void> {
  const hexId = "0x" + PEXLI_CHAIN_ID.toString(16);
  await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
}

/** Subscribe to account/chain changes. Returns an unsubscribe function. */
export function watchWallet(
  provider: Eip1193Provider,
  handlers: { onAccountsChanged?: (accounts: string[]) => void; onChainChanged?: (chainId: number) => void }
): () => void {
  const onAcc = (...a: unknown[]) => handlers.onAccountsChanged?.((a[0] as string[]) ?? []);
  const onChain = (...a: unknown[]) => handlers.onChainChanged?.(Number(a[0] as string));
  provider.on?.("accountsChanged", onAcc);
  provider.on?.("chainChanged", onChain);
  return () => {
    provider.removeListener?.("accountsChanged", onAcc);
    provider.removeListener?.("chainChanged", onChain);
  };
}
