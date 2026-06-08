/**
 * Tests for harness-pinned reference resolution: inline-span extraction (fenced
 * blocks skipped), code-shape gating, and opportunistic pinning against a
 * project index built from real files.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  inlineSpans,
  isCodeShaped,
  buildProjectIndex,
  pinReferences,
} from "./pin.js";

test("inlineSpans skips fenced code blocks (R1)", () => {
  const spans = inlineSpans(
    "Use `parseConfig` here.\n```ts\n`insideFence`\n```\nAnd `MAX_RETRIES`.\n",
  );
  const texts = spans.map((s) => s.text);
  assert.deepEqual(texts, ["parseConfig", "MAX_RETRIES"]);
  assert.equal(spans[0].line, 1);
  assert.equal(spans[1].line, 5);
});

test("isCodeShaped gates prose from code references", () => {
  for (const ok of [
    "parseConfig",
    "MAX_RETRIES",
    "parse_config",
    "User#full_name",
    "Widget",
  ]) {
    assert.equal(isCodeShaped(ok), true, ok);
  }
  for (const no of ["name", "high", "text", "the", "a path/file.ts"]) {
    assert.equal(isCodeShaped(no), false, no);
  }
});

test("pins unique code-shaped refs, flags typos, ignores prose", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-pin-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "config.ts"),
      "export function parseConfig(x){return x}\nexport const MAX_RETRIES = 3;\n",
    );
    const index = buildProjectIndex(dir);
    const md =
      "Call `parseConfig` with `MAX_RETRIES`. Prose `high`. Typo `parseConfgi`.\n";
    const { pinned, unresolved } = pinReferences(md, index);

    const pinnedRefs = pinned.map((p) => p.ref).sort();
    assert.deepEqual(pinnedRefs, ["MAX_RETRIES", "parseConfig"]);
    assert.equal(
      pinned.find((p) => p.ref === "parseConfig")?.file,
      "src/config.ts",
    );

    // The typo is surfaced; prose `high` is not (not code-shaped).
    assert.deepEqual(
      unresolved.map((u) => u.ref),
      ["parseConfgi"],
    );
    assert.equal(unresolved[0].status, "missing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ambiguous references are reported with candidates, not pinned", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-pin-amb-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "a.ts"), "export function helperFn(){}\n");
    writeFileSync(join(dir, "src", "b.ts"), "export function helperFn(){}\n");
    const index = buildProjectIndex(dir);
    const { pinned, unresolved } = pinReferences("See `helperFn`.\n", index);
    assert.equal(pinned.length, 0);
    assert.equal(unresolved[0].status, "ambiguous");
    assert.equal(unresolved[0].candidates.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
