/**
 * Tests for file-qualified symbol reference verification: inline-span extraction
 * (fenced blocks skipped), the `vigiles:symbol path#symbol` mark, verifying the
 * named file defines the symbol, and the unmarked-code enforcement.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  inlineSpans,
  symbolRefs,
  verifySymbolRefs,
  unmarkedCodeRefs,
} from "./refs.js";

test("inlineSpans skips fenced code blocks (R1)", () => {
  const spans = inlineSpans("Use `a` here.\n```ts\n`inside`\n```\nAnd `b`.\n");
  assert.deepEqual(
    spans.map((s) => s.text),
    ["a", "b"],
  );
  assert.equal(spans[0].line, 1);
  assert.equal(spans[1].line, 5);
});

test("symbolRefs matches the vigiles:symbol mark, ignores everything else", () => {
  const refs = symbolRefs(
    "See `vigiles:symbol src/config.ts#parseConfig` and `vigiles:symbol app/user.rb::full_name`.\n" +
      "Prose `parseConfig`, bare `src/config.ts#parseConfig`, file `src/x.ts`.\n",
  );
  assert.deepEqual(
    refs.map((r) => `${r.file}#${r.symbol}`),
    ["src/config.ts#parseConfig", "app/user.rb#full_name"],
  );
});

test("verifies the named file defines the marked symbol (error otherwise)", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-symref-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "config.ts"),
      "export function parseConfig(x){return x}\n",
    );
    assert.equal(
      verifySymbolRefs("Use `vigiles:symbol src/config.ts#parseConfig`.\n", dir)
        .length,
      0,
    );
    const missing = verifySymbolRefs(
      "Use `vigiles:symbol src/config.ts#loadConfig`.\n",
      dir,
    );
    assert.equal(missing.length, 1);
    assert.match(missing[0].reason, /"loadConfig" is not defined/);
    const noFile = verifySymbolRefs(
      "Use `vigiles:symbol src/gone.ts#parseConfig`.\n",
      dir,
    );
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
    const md = "Call `vigiles:symbol src/config.ts#parseConfig`.\n";
    writeFileSync(src, "export function parseConfig(){}\n");
    assert.equal(verifySymbolRefs(md, dir).length, 0);
    writeFileSync(src, "export function loadConfig(){}\n");
    assert.equal(verifySymbolRefs(md, dir).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cross-language: resolves a Ruby vigiles:symbol mark", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-symref-rb-"));
  try {
    mkdirSync(join(dir, "app"));
    writeFileSync(
      join(dir, "app", "user.rb"),
      "class User\n  def full_name\n  end\nend\n",
    );
    assert.equal(
      verifySymbolRefs("See `vigiles:symbol app/user.rb#full_name`.\n", dir)
        .length,
      0,
    );
    assert.equal(
      verifySymbolRefs("See `vigiles:symbol app/user.rb#display_name`.\n", dir)
        .length,
      1,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unmarkedCodeRefs flags bare code refs, not marks/prose/paths", () => {
  const md =
    "Use `parseConfig` and `MAX_RETRIES`.\n" + // code-shaped, unmarked → flagged
    "Marked `vigiles:symbol src/config.ts#chargeCard`.\n" + // a mark → ok
    "Prose `name` and `high`. A path `src/config.ts`.\n" + // not flagged
    "Ignored `legacyThing`. <!-- vigiles:ignore -->\n"; // opted out
  const flagged = unmarkedCodeRefs(md)
    .map((s) => s.text)
    .sort();
  assert.deepEqual(flagged, ["MAX_RETRIES", "parseConfig"]);
});

test("vigiles:ignore-file opts the whole file out", () => {
  const md = "<!-- vigiles:ignore-file -->\nUse `parseConfig` freely.\n";
  assert.equal(unmarkedCodeRefs(md).length, 0);
});
