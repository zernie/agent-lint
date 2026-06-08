/**
 * Tests for live symbol-reference verification: inline-span extraction (fenced
 * blocks skipped), code-shape gating, and live resolution against a project
 * index — no stored state.
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
  verifyRefs,
} from "./refs.js";

test("inlineSpans skips fenced code blocks (R1)", () => {
  const spans = inlineSpans(
    "Use `parseConfig` here.\n```ts\n`insideFence`\n```\nAnd `MAX_RETRIES`.\n",
  );
  assert.deepEqual(
    spans.map((s) => s.text),
    ["parseConfig", "MAX_RETRIES"],
  );
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

test("verifyRefs resolves live: unique → resolved, typo → missing, prose ignored", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-refs-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "config.ts"),
      "export function parseConfig(x){return x}\nexport const MAX_RETRIES = 3;\n",
    );
    const index = buildProjectIndex(dir);
    const md =
      "Call `parseConfig` with `MAX_RETRIES`. Prose `high`. Typo `parseConfgi`.\n";
    const { resolved, unresolved } = verifyRefs(md, index);

    assert.deepEqual(resolved.map((r) => r.ref).sort(), [
      "MAX_RETRIES",
      "parseConfig",
    ]);
    assert.equal(
      resolved.find((r) => r.ref === "parseConfig")?.file,
      "src/config.ts",
    );
    assert.deepEqual(
      unresolved.map((u) => u.ref),
      ["parseConfgi"],
    );
    assert.equal(unresolved[0].status, "missing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a rename surfaces live with no stored state", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-refs-rename-"));
  try {
    mkdirSync(join(dir, "src"));
    const src = join(dir, "src", "config.ts");
    writeFileSync(src, "export function parseConfig(){}\n");
    const md = "Call `parseConfig`.\n";

    assert.equal(verifyRefs(md, buildProjectIndex(dir)).unresolved.length, 0);

    // Rename in the code — a fresh index (no sidecar) reflects it immediately.
    writeFileSync(src, "export function loadConfig(){}\n");
    const after = verifyRefs(md, buildProjectIndex(dir));
    assert.equal(after.resolved.length, 0);
    assert.equal(after.unresolved[0].ref, "parseConfig");
    assert.equal(after.unresolved[0].status, "missing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ambiguous references are reported with candidates", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-refs-amb-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "a.ts"), "export function helperFn(){}\n");
    writeFileSync(join(dir, "src", "b.ts"), "export function helperFn(){}\n");
    const { resolved, unresolved } = verifyRefs(
      "See `helperFn`.\n",
      buildProjectIndex(dir),
    );
    assert.equal(resolved.length, 0);
    assert.equal(unresolved[0].status, "ambiguous");
    assert.equal(unresolved[0].candidates.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
