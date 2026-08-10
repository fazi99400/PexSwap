import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, concat, numberToBytes, toBytes, pad } from "viem";
import {
  u64be,
  rustBalanceSlot,
  encodeRustOp,
  encodePxc20Transfer,
  buildRustTransferTx,
  encodeBridgeRead,
  decodeBytes32String,
  fetchRustTokenMeta,
} from "../dist/rustlane.js";
import { NS, OP, RUSTVM_ADDRESS, BRIDGE, PXC_BRIDGE_ADDRESS } from "../dist/constants.js";

const HOLDER = "0x1111111111111111111111111111111111111111";
const TO = "0x2222222222222222222222222222222222222222";

test("u64be encodes big-endian 8 bytes", () => {
  assert.equal(Buffer.from(u64be(1n)).toString("hex"), "0000000000000001");
  assert.equal(Buffer.from(u64be(0x0102030405060708n)).toString("hex"), "0102030405060708");
  assert.throws(() => u64be(2n ** 64n));
});

test("rustBalanceSlot = keccak256(ns || id_be8 || holder20)", () => {
  const id = 7n;
  const slot = rustBalanceSlot(id, HOLDER, NS.PXC20);
  // independent reconstruction of the documented preimage
  const preimage = concat([Uint8Array.of(NS.PXC20), numberToBytes(id, { size: 8 }), toBytes(pad(HOLDER, { size: 20 }))]);
  assert.equal(preimage.length, 1 + 8 + 20); // 29-byte preimage
  assert.equal(slot, keccak256(preimage));
  assert.equal(slot.length, 66); // 32-byte hash as 0x + 64 hex
});

test("different holders/ids give different slots", () => {
  assert.notEqual(rustBalanceSlot(1n, HOLDER), rustBalanceSlot(2n, HOLDER));
  assert.notEqual(rustBalanceSlot(1n, HOLDER), rustBalanceSlot(1n, TO));
  assert.notEqual(rustBalanceSlot(1n, HOLDER, NS.PXC20), rustBalanceSlot(1n, HOLDER, NS.PXC1155));
});

test("encodeRustOp = op(1) || id_be8 || to20 || amount_be8 (37 bytes)", () => {
  const data = encodeRustOp(OP.XFER_20, 7n, TO, 1000n);
  const bytes = Buffer.from(data.slice(2), "hex");
  assert.equal(bytes.length, 1 + 8 + 20 + 8); // 37
  assert.equal(bytes[0], 0x21); // XFER_20
  assert.equal(bytes.subarray(1, 9).toString("hex"), "0000000000000007"); // id
  assert.equal(bytes.subarray(9, 29).toString("hex"), TO.slice(2).toLowerCase()); // to
  assert.equal(bytes.subarray(29, 37).toString("hex"), "00000000000003e8"); // 1000
});

test("encodePxc20Transfer uses XFER_20 opcode", () => {
  const a = encodePxc20Transfer(3n, TO, 5n);
  const b = encodeRustOp(OP.XFER_20, 3n, TO, 5n);
  assert.equal(a, b);
});

test("buildRustTransferTx targets RUSTVM with zero value", () => {
  const tx = buildRustTransferTx(9n, TO, 42n);
  assert.equal(tx.to, RUSTVM_ADDRESS);
  assert.equal(tx.value, "0x0");
  assert.equal(tx.data, encodePxc20Transfer(9n, TO, 42n));
});

/* ---- bridge metadata reads (name/symbol/decimals for a rust id) ---- */

/** bytes32 word for a utf-8 string, right-padded — how the bridge answers. */
const word32 = (s) => {
  const b = Buffer.alloc(32);
  Buffer.from(s, "utf8").copy(b);
  return "0x" + b.toString("hex");
};
const uint256 = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0");

/** Bridge stub: answers 0x01/0x02/0x03 for one known id, empty for anything else. */
function bridgeStub(meta, knownId = 90909n, seen = []) {
  return {
    seen,
    async call({ to, data }) {
      seen.push({ to, data });
      const selector = parseInt(data.slice(2, 4), 16);
      const id = BigInt("0x" + data.slice(4, 20));
      if (id !== knownId) return { data: selector === BRIDGE.DECIMALS ? uint256(0) : word32("") };
      if (selector === BRIDGE.DECIMALS) return { data: uint256(meta.decimals ?? 0) };
      if (selector === BRIDGE.SYMBOL) return { data: word32(meta.symbol ?? "") };
      if (selector === BRIDGE.NAME) return { data: word32(meta.name ?? "") };
      throw new Error("unexpected selector " + selector);
    },
  };
}

test("encodeBridgeRead = selector(1) || id_be8 (9 bytes)", () => {
  const data = encodeBridgeRead(BRIDGE.SYMBOL, 90909n);
  const bytes = Buffer.from(data.slice(2), "hex");
  assert.equal(bytes.length, 1 + 8);
  assert.equal(bytes[0], 0x02);
  assert.equal(bytes.subarray(1, 9).toString("hex"), "000000000001631d");
  // matches the layout test/dual-bridge-check.mjs uses against the live chain
  assert.equal(data, "0x02000000000001631d");
});

test("decodeBytes32String strips the right padding", () => {
  assert.equal(decodeBytes32String(word32("RGOLD")), "RGOLD");
  assert.equal(decodeBytes32String(word32("")), "");
  assert.equal(decodeBytes32String("0x"), "");
  assert.equal(decodeBytes32String(undefined), "");
  assert.equal(decodeBytes32String(null), "");
});

test("fetchRustTokenMeta reads name/symbol/decimals off the bridge", async () => {
  const stub = bridgeStub({ symbol: "RGOLD", name: "Rust Gold", decimals: 8 });
  const meta = await fetchRustTokenMeta(stub, 90909n);
  assert.deepEqual(meta, { symbol: "RGOLD", name: "Rust Gold", decimals: 8, hasMetadata: true });
  assert.equal(stub.seen.length, 3);
  for (const c of stub.seen) assert.equal(c.to, PXC_BRIDGE_ADDRESS);
});

test("fetchRustTokenMeta reports missing metadata instead of faking it", async () => {
  const meta = await fetchRustTokenMeta(bridgeStub({}, 1n), 90909n);
  assert.deepEqual(meta, { symbol: "", name: "", decimals: 0, hasMetadata: false });
});

test("fetchRustTokenMeta survives a chain with no bridge at all", async () => {
  const dead = { async call() { throw new Error("execution reverted"); } };
  const meta = await fetchRustTokenMeta(dead, 90909n);
  assert.equal(meta.hasMetadata, false);
  assert.equal(meta.decimals, 0);
});
