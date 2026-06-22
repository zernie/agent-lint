/**
 * Guardrail-verification test suite (vitest) — the committed "false confidence"
 * receipt. Two byte-identical-looking force-push guards differ only in exit code;
 * the engine must tell them apart (exit 1 = silently allows, exit 2 = blocks).
 * Real shell hooks via runHook; no model, no jq dependency (greps the event JSON).
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

import {
  DISASTER_CATALOG,
  verifyGuardrail,
  unblockedDisasters,
  assertBlocksDisasters,
  formatGuardrailReport,
} from "./guardrail-check.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

/** A push-guard that blocks `git push` with the given exit code. */
function writeGuard(dir: string, name: string, exitCode: number): string {
  const body = `#!/usr/bin/env bash
INPUT=$(cat)
if echo "$INPUT" | grep -q 'git push'; then
  echo "BLOCKED: no direct pushes" >&2
  exit ${exitCode}
fi
exit 0
`;
  const path = join(dir, name);
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return `bash ${path}`;
}

const PUSH_EVENTS = DISASTER_CATALOG.filter((e) =>
  e.id.startsWith("force-push"),
);

test("exit 2 guard BLOCKS the force-push battery; exit 1 guard silently allows it", () => {
  const dir = makeTmpDir("guardrail-receipt");
  try {
    const real = writeGuard(dir, "real-guard.sh", 2);
    const fake = writeGuard(dir, "fake-guard.sh", 1);

    const realResults = verifyGuardrail(real, { events: PUSH_EVENTS });
    assert.ok(
      realResults.every((r) => r.blocked),
      "exit 2 should block every push",
    );

    const fakeResults = verifyGuardrail(fake, { events: PUSH_EVENTS });
    assert.ok(
      fakeResults.every((r) => !r.blocked),
      "exit 1 looks like a block but allows — the false-confidence bug",
    );
    assert.equal(fakeResults[0].exitCode, 1);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("assertBlocksDisasters passes the real guard, throws on the fake with the misses", () => {
  const dir = makeTmpDir("guardrail-assert");
  try {
    const real = writeGuard(dir, "real-guard.sh", 2);
    const fake = writeGuard(dir, "fake-guard.sh", 1);

    // Real guard over the push subset → no throw.
    assert.doesNotThrow(() =>
      assertBlocksDisasters(real, { events: PUSH_EVENTS }),
    );

    // Fake guard → throws, naming the missed actions.
    assert.throws(
      () => assertBlocksDisasters(fake, { events: PUSH_EVENTS }),
      /did NOT block/,
    );
    assert.throws(
      () => assertBlocksDisasters(fake, { events: PUSH_EVENTS }),
      /false confidence/,
    );
  } finally {
    cleanupTmpDir(dir);
  }
});

test("a guard that only handles git misses the rm -rf / secret-read battery", () => {
  const dir = makeTmpDir("guardrail-partial");
  try {
    const gitOnly = writeGuard(dir, "git-only.sh", 2);
    const results = verifyGuardrail(gitOnly); // full catalog
    const misses = unblockedDisasters(results);
    // It blocks the git pushes but not rm -rf, no-verify, ssh-read, curl|sh.
    const missedIds = misses.map((m) => m.event.id);
    assert.ok(missedIds.includes("rm-rf"));
    assert.ok(missedIds.includes("read-ssh-key"));
    assert.ok(missedIds.includes("curl-pipe-sh"));
  } finally {
    cleanupTmpDir(dir);
  }
});

test("category filter restricts the battery", () => {
  const dir = makeTmpDir("guardrail-cat");
  try {
    const guard = writeGuard(dir, "g.sh", 2);
    const results = verifyGuardrail(guard, { categories: ["destructive-fs"] });
    assert.ok(results.every((r) => r.event.category === "destructive-fs"));
    assert.ok(results.length >= 1);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("formatGuardrailReport is NEUTRAL — reports allows without judging intent", () => {
  const dir = makeTmpDir("guardrail-fmt");
  try {
    const fake = writeGuard(dir, "fake.sh", 1);
    const report = formatGuardrailReport(
      fake,
      verifyGuardrail(fake, { events: PUSH_EVENTS }),
    );
    assert.match(report, /allows/);
    assert.match(report, /blocks 0\/2/);
    // The coverage map must NOT call an allow "false confidence" — intent unknown.
    assert.doesNotMatch(report, /false confidence/);
    // It points the user at the intent-declaring gate instead.
    assert.match(report, /assertBlocksDisasters/);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("the catalog is well-formed: unique ids, every entry has a command", () => {
  const ids = new Set(DISASTER_CATALOG.map((e) => e.id));
  assert.equal(ids.size, DISASTER_CATALOG.length);
  for (const e of DISASTER_CATALOG) {
    assert.equal(typeof e.input.command, "string");
    assert.ok((e.input.command as string).length > 0);
  }
});
