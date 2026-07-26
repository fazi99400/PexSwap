import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, concat, numberToBytes, toBytes, pad } from "viem";
import {
  u64be,
  rustBalanceSlot,
  encodeRustOp,
  encodePxc20Transfer,
  buildRustTransferTx,
} from "../dist/rustlane.js";
import { NS, OP, RUSTVM_ADDRESS } from "../dist/constants.js";

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
