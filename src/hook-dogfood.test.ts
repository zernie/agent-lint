/**
 * OSS dogfood — does a COMPILED hook actually close the gaps a hand-written
 * safety guard leaves? Measured deterministically with our own DISASTER_CATALOG
 * as the oracle (no model, no key, runs in CI).
 *
 * The "before" is the SHAPE of a widely-copied safety hook: a string-match
 * blocklist. We ran the real one (disler/claude-code-hooks-mastery's
 * `pre_tool_use.py`) against this exact battery and found it blocks only 2/7 —
 * it misses a force-push hidden in a compound command, `git reset --hard`,
 * `--no-verify`, a private-SSH-key read, and `curl | sh` (research/hook-pain-points.md).
 * Here we reproduce that bug CLASS with a faithful naive guard, then prove the
 * compiled hook (examples/harness/safe-bash-guard.mjs) blocks all 7 by
 * construction — the matching is AST-backed and the protocol is emitted, so the
 * blind spots and the false-confidence bug class simply can't occur.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

import {
  verifyGuardrail,
  unblockedDisasters,
  assertBlocksDisasters,
} from "./guardrail-check.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

const REPO_ROOT = resolve(__dirname, "..");
const CLI = resolve(REPO_ROOT, "dist", "cli.js");
const COMPILED_GUARD = resolve(
  REPO_ROOT,
  "examples",
  "harness",
  "safe-bash-guard.mjs",
);

// The hand-written shape: a literal-substring blocklist (what a copier writes,
// and what the real disler hook does in Python). Correctly coded (exit 2) — the
// bug is SCOPE, not the protocol: it only sees the exact strings it lists.
const NAIVE_GUARD = `#!/usr/bin/env bash
input=$(cat)
case "$input" in
  *"git push --force"*) echo "blocked: force push" >&2; exit 2 ;;
  *"rm -rf /"*) echo "blocked: rm -rf" >&2; exit 2 ;;
esac
exit 0
`;

test("a hand-written substring guard has the documented blind spots (the bug class)", () => {
  const dir = makeTmpDir();
  try {
    const guard = resolve(dir, "naive-guard.sh");
    writeFileSync(guard, NAIVE_GUARD);
    chmodSync(guard, 0o755);

    const results = verifyGuardrail(`bash ${guard}`);
    const missed = unblockedDisasters(results).map((m) => m.event.id);

    // It catches the two literal strings it lists …
    assert.ok(!missed.includes("force-push"), "blocks literal --force");
    assert.ok(!missed.includes("rm-rf"), "blocks literal rm -rf /");
    // … and silently misses everything else — exactly the false-confidence gap.
    for (const id of [
      "force-push-compound",
      "reset-hard",
      "no-verify-commit",
      "read-ssh-key",
      "curl-pipe-sh",
    ]) {
      assert.ok(missed.includes(id), `naive guard misses ${id}`);
    }
  } finally {
    cleanupTmpDir(dir);
  }
});

test("the COMPILED hook blocks all 7 disasters by construction (closes the gaps)", () => {
  // cwd = repo root so the example's `../../dist/hook.js` import resolves.
  // No throw ⇒ every disaster in the battery is denied (exit 2).
  assertBlocksDisasters(`node ${CLI} run-hook-program ${COMPILED_GUARD}`, {
    cwd: REPO_ROOT,
  });
});
