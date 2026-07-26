import { test } from "node:test";
import assert from "node:assert/strict";
import { getLifeloxProvider, connectLifelox, discoverProviders } from "../dist/wallet.js";
import { LIFELOX_WALLET_RDNS } from "../dist/constants.js";

// Minimal EIP-6963 window mock: wallets register announcers that fire on the
// "eip6963:requestProvider" event, exactly like a real browser.
function makeWindow(wallets, { ethereum } = {}) {
  const listeners = new Map();
  const win = {
    ethereum,
    CustomEvent: class {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    addEventListener: (t, l) => {
      const arr = listeners.get(t) ?? [];
      arr.push(l); listeners.set(t, arr);
    },
    removeEventListener: (t, l) => {
      listeners.set(t, (listeners.get(t) ?? []).filter((x) => x !== l));
    },
    dispatchEvent: (e) => {
      (listeners.get(e.type) ?? []).forEach((l) => l(e));
      // wallets respond to a request by announcing themselves
      if (e.type === "eip6963:requestProvider") {
        for (const w of wallets) {
          const ev = new win.CustomEvent("eip6963:announceProvider", { detail: w });
          (listeners.get("eip6963:announceProvider") ?? []).forEach((l) => l(ev));
        }
      }
      return true;
    },
  };
  return win;
}

const lifeloxDetail = {
  info: { uuid: "u-lifelox", name: "Lifelox", icon: "data:,", rdns: LIFELOX_WALLET_RDNS },
  provider: {
    request: async ({ method }) => {
      if (method === "eth_requestAccounts") return ["0xabc0000000000000000000000000000000000abc"];
      if (method === "eth_chainId") return "0x13435"; // 78901
      return null;
    },
  },
};
const otherDetail = {
  info: { uuid: "u-other", name: "OtherWallet", icon: "data:,", rdns: "com.other.wallet" },
  provider: { request: async () => null },
};

test("discovers multiple announced providers", async () => {
  const win = makeWindow([otherDetail, lifeloxDetail]);
  const found = await discoverProviders(win, 10);
  assert.equal(found.length, 2);
});

test("getLifeloxProvider picks the Lifelox rdns even among others", async () => {
  const win = makeWindow([otherDetail, lifeloxDetail]);
  const p = await getLifeloxProvider(win, 10);
  assert.equal(p, lifeloxDetail.provider);
});

test("falls back to window.ethereum when no EIP-6963 match", async () => {
  const fallback = { request: async () => null };
  const win = makeWindow([otherDetail], { ethereum: fallback });
  const p = await getLifeloxProvider(win, 10);
  assert.equal(p, fallback);
});

test("connectLifelox returns account + chain and flags correct chain", async () => {
  const win = makeWindow([lifeloxDetail]);
  const res = await connectLifelox(win);
  assert.equal(res.address, "0xabc0000000000000000000000000000000000abc");
  assert.equal(res.chainId, 78901);
  assert.equal(res.onChainWrong, false);
});

test("connect flags wrong chain when not Pexli", async () => {
  const wrongChain = {
    info: { uuid: "u-l2", name: "Lifelox", icon: "data:,", rdns: LIFELOX_WALLET_RDNS },
    provider: {
      request: async ({ method }) =>
        method === "eth_requestAccounts" ? ["0xabc0000000000000000000000000000000000abc"] : "0x1", // chain 1
    },
  };
  const res = await connectLifelox(makeWindow([wrongChain]));
  assert.equal(res.onChainWrong, true);
});
