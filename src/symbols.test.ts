/**
 * Tests for the cross-language symbol index (ast-grep): per-file extraction,
 * the project index, and bare/scoped resolution (unique/ambiguous/missing).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Lang } from "@ast-grep/napi";

import {
  definedSymbols,
  langForFile,
  SymbolIndex,
  resolveSymbol,
} from "./symbols.js";

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

test("resolves a unique symbol, reports ambiguity and misses", () => {
  const index = new SymbolIndex();
  index.add(
    "src/config.ts",
    definedSymbols("export function parseConfig(){}", Lang.TypeScript),
  );
  index.add(
    "src/a.ts",
    definedSymbols("export function dup(){}", Lang.TypeScript),
  );
  index.add(
    "src/b.ts",
    definedSymbols("export function dup(){}", Lang.TypeScript),
  );

  const ok = resolveSymbol(index, "parseConfig");
  assert.equal(ok.status, "unique");
  assert.equal(ok.locations[0].file, "src/config.ts");

  assert.equal(resolveSymbol(index, "dup").status, "ambiguous");
  assert.equal(resolveSymbol(index, "GHOST").status, "missing");
});

test("a scoped reference narrows to the enclosing class", () => {
  const index = new SymbolIndex();
  index.add(
    "app/user.rb",
    definedSymbols("class User\n  def full_name\n  end\nend", "ruby"),
  );
  index.add(
    "app/post.rb",
    definedSymbols("class Post\n  def full_name\n  end\nend", "ruby"),
  );
  // bare `full_name` is ambiguous across two classes...
  assert.equal(resolveSymbol(index, "full_name").status, "ambiguous");
  // ...but `User#full_name` resolves uniquely.
  const scoped = resolveSymbol(index, "User#full_name");
  assert.equal(scoped.status, "unique");
  assert.equal(scoped.locations[0].file, "app/user.rb");
});
