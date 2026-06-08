/**
 * Tests for file-qualified symbol reference verification (variant A):
 * inline-span extraction (fenced blocks skipped), `path#symbol` parsing, and
 * verifying the named file defines the named symbol.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { inlineSpans, symbolRefs, verifySymbolRefs } from "./refs.js";

test("inlineSpans skips fenced code blocks (R1)", () => {
  const spans = inlineSpans(
    "Use `src/a.ts#foo` here.\n```ts\n`src/x.ts#inside`\n```\nAnd `src/b.ts#bar`.\n",
  );
  assert.deepEqual(
    spans.map((s) => s.text),
    ["src/a.ts#foo", "src/b.ts#bar"],
  );
  assert.equal(spans[0].line, 1);
  assert.equal(spans[1].line, 5);
});

test("symbolRefs matches path#symbol / path::symbol, ignores bare refs", () => {
  const refs = symbolRefs(
    "See `src/config.ts#parseConfig` and `app/user.rb::full_name`.\n" +
      "Prose `parseConfig`, scoped-no-path `Foo::bar`, file `src/x.ts`.\n",
  );
  assert.deepEqual(
    refs.map((r) => `${r.file}#${r.symbol}`),
    ["src/config.ts#parseConfig", "app/user.rb#full_name"],
  );
});

test("verifies the named file defines the symbol (error otherwise)", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-symref-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "config.ts"),
      "export function parseConfig(x){return x}\n",
    );
    // valid → no error
    assert.equal(
      verifySymbolRefs("Use `src/config.ts#parseConfig`.\n", dir).length,
      0,
    );
    // symbol missing → error
    const missing = verifySymbolRefs("Use `src/config.ts#loadConfig`.\n", dir);
    assert.equal(missing.length, 1);
    assert.match(missing[0].reason, /"loadConfig" is not defined/);
    // file missing → error
    const noFile = verifySymbolRefs("Use `src/gone.ts#parseConfig`.\n", dir);
    assert.equal(noFile.length, 1);
    assert.match(noFile[0].reason, /File not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a rename surfaces live (re-parses the named file each time)", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-symref-rename-"));
  try {
    mkdirSync(join(dir, "src"));
    const src = join(dir, "src", "config.ts");
    const md = "Call `src/config.ts#parseConfig`.\n";
    writeFileSync(src, "export function parseConfig(){}\n");
    assert.equal(verifySymbolRefs(md, dir).length, 0);
    writeFileSync(src, "export function loadConfig(){}\n");
    assert.equal(verifySymbolRefs(md, dir).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cross-language: resolves a Ruby file-qualified reference", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-symref-rb-"));
  try {
    mkdirSync(join(dir, "app"));
    writeFileSync(
      join(dir, "app", "user.rb"),
      "class User\n  def full_name\n  end\nend\n",
    );
    assert.equal(
      verifySymbolRefs("See `app/user.rb#full_name`.\n", dir).length,
      0,
    );
    assert.equal(
      verifySymbolRefs("See `app/user.rb#display_name`.\n", dir).length,
      1,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
