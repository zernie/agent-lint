/**
 * Tests for the cross-language symbol index (ast-grep): per-file extraction,
 * the project index, and bare/scoped resolution (unique/ambiguous/missing).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Lang } from "@ast-grep/napi";

import { definedSymbols, langForFile, fileDefinesSymbol } from "./symbols.js";

test("extracts functions, constants, classes and methods (TypeScript)", () => {
  const defs = definedSymbols(
    `export function parseConfig(x) { return x; }
export const MAX = 3;
export class Widget { render() {} }`,
    Lang.TypeScript,
  );
  const names = defs.map((d) => d.name);
  assert.ok(names.includes("parseConfig"));
  assert.ok(names.includes("MAX"));
  assert.ok(names.includes("Widget"));
  const render = defs.find((d) => d.name === "render");
  assert.equal(render?.scope, "Widget"); // method carries enclosing class
  assert.ok((render?.line ?? 0) > 0); // 1-based line is populated
});

test("extracts Python defs including bare-assignment constants", () => {
  const defs = definedSymbols(
    `def parse_config(x):\n    return x\nMAX = 3\nclass Widget:\n    def render(self):\n        pass`,
    "python",
  );
  const names = defs.map((d) => d.name);
  assert.ok(names.includes("parse_config"));
  assert.ok(names.includes("MAX")); // assignment `left`, not a `name` field
  assert.equal(defs.find((d) => d.name === "render")?.scope, "Widget");
});

test("extracts Ruby class/method/constant", () => {
  const defs = definedSymbols(
    `class User\n  def full_name\n  end\nend\nMAX = 3`,
    "ruby",
  );
  assert.equal(defs.find((d) => d.name === "full_name")?.scope, "User");
  assert.ok(defs.some((d) => d.name === "MAX"));
});

test("langForFile maps extensions and skips unsupported", () => {
  assert.equal(langForFile("a.py"), "python");
  assert.equal(langForFile("a.rs"), "rust");
  assert.equal(langForFile("a.rb"), "ruby");
  assert.equal(langForFile("a.txt"), null);
  assert.notEqual(langForFile("a.ts"), null);
});

test("fileDefinesSymbol checks one named file (no project index)", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-sym-file-"));
  try {
    mkdirSync(join(dir, "src"));
    const f = join(dir, "src", "config.ts");
    writeFileSync(
      f,
      "export function parseConfig(){}\nexport const MAX = 1;\n",
    );
    assert.equal(fileDefinesSymbol(f, "parseConfig"), true);
    assert.equal(fileDefinesSymbol(f, "MAX"), true);
    assert.equal(fileDefinesSymbol(f, "missingSymbol"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
