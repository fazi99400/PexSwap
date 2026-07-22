// Compiles every PexSwap contract with the bundled solc wasm and returns
// { [ContractName]: { abi, bytecode } }. No native solc / network needed.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const solc = require("solc");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "contracts");

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith(".sol")) out.push(p);
  }
  return out;
}

export function compileAll() {
  const sources = {};
  for (const f of walk(ROOT)) {
    sources[path.relative(ROOT, f)] = { content: fs.readFileSync(f, "utf8") };
  }

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 999999 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const findImports = (importPath) => {
    const p = path.join(ROOT, importPath);
    return fs.existsSync(p)
      ? { contents: fs.readFileSync(p, "utf8") }
      : { error: "File not found: " + importPath };
  };

  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (out.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    throw new Error(`solc: ${errors.length} error(s)`);
  }

  const artifacts = {};
  for (const file of Object.keys(out.contracts)) {
    for (const name of Object.keys(out.contracts[file])) {
      const c = out.contracts[file][name];
      artifacts[name] = { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object };
    }
  }
  return artifacts;
}
