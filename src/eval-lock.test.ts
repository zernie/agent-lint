import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evalInputsHash,
  buildLock,
  readLock,
  writeLock,
  lockPath,
  lockSlug,
  decideLock,
  diffReportNumbers,
  formatLockUpdate,
  lockModeFromEnv,
  evalApiVersionFromEnv,
  anyLocksCommitted,
  LOCK_VERSION,
  type EvalLock,
} from "./eval-lock.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "vig-lock-"));
}

const BASE = {
  model: "claude-sonnet-4-6",
  evalApiVersion: 1,
  inputs: { task: "do X", tools: ["Read", "Bash"], pluginDirHash: "abc" },
};

test("evalInputsHash is stable + order-independent", () => {
  const a = evalInputsHash(BASE);
  const b = evalInputsHash({
    ...BASE,
    // reorder the inputs object keys — canonical sorts them
    inputs: { pluginDirHash: "abc", tools: ["Read", "Bash"], task: "do X" },
  });
  assert.equal(a, b);
});

test("evalInputsHash changes when ANY model-affecting field changes", () => {
  const base = evalInputsHash(BASE);
  assert.notEqual(base, evalInputsHash({ ...BASE, model: "claude-opus-4-8" }));
  assert.notEqual(base, evalInputsHash({ ...BASE, evalApiVersion: 2 }));
  assert.notEqual(
    base,
    evalInputsHash({ ...BASE, inputs: { ...BASE.inputs, task: "do Y" } }),
  );
  assert.notEqual(
    base,
    evalInputsHash({
      ...BASE,
      inputs: { ...BASE.inputs, pluginDirHash: "def" },
    }),
  );
});

test("the harness version is NOT in the hash (CI claude is pinned ≠ a dev's local claude)", () => {
  // harnessVersionKey is provenance on the lock, never a hash input — so `--check`
  // stays binary-free and never false-trips on a pinned-CI-vs-local version gap.
  // EvalLockInputs has no such field; passing one is simply ignored by the type.
  const a = evalInputsHash(BASE);
  const b = evalInputsHash({ ...BASE });
  assert.equal(a, b);
});

test("lockSlug is filesystem-safe + never empty", () => {
  assert.equal(lockSlug("Trigger Rate: my-skill"), "trigger-rate-my-skill");
  assert.equal(lockSlug("!!!"), "eval");
  assert.equal(lockSlug("AB/cd"), "ab-cd");
});

test("buildLock + writeLock + readLock round-trip", () => {
  const dir = tmp();
  try {
    const lock = buildLock({
      name: "my eval",
      inputsHash: evalInputsHash(BASE),
      model: BASE.model,
      harnessVersionKey: "2.1", // provenance on the lock, not a hash input
      evalApiVersion: BASE.evalApiVersion,
      builtAt: "2026-06-30T00:00:00.000Z",
      report: { rate: 0.9, n: 20 },
    });
    writeLock(dir, lock);
    const read = readLock(dir, "my eval");
    assert.deepEqual(read, lock);
    assert.equal(read?.version, LOCK_VERSION);
    // pretty-printed for a reviewable diff
    assert.ok(readFileSync(lockPath(dir, "my eval"), "utf-8").includes("\n  "));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readLock returns null on a miss", () => {
  const dir = tmp();
  try {
    assert.equal(readLock(dir, "absent"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readLock THROWS on corrupt JSON (a broken lock is not a silent 'no lock')", () => {
  const dir = tmp();
  try {
    writeFileSync(lockPath(dir, "bad"), "{not json");
    assert.throws(() => readLock(dir, "bad"), /corrupt lock/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readLock THROWS on an unsupported version (no silent stale-shape replay)", () => {
  const dir = tmp();
  try {
    writeFileSync(
      lockPath(dir, "old"),
      JSON.stringify({ version: 999, name: "old", report: {} }),
    );
    assert.throws(() => readLock(dir, "old"), /unsupported version/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readLock THROWS when the lock JSON isn't an object", () => {
  const dir = tmp();
  try {
    writeFileSync(lockPath(dir, "scalar"), "42"); // valid JSON, not an object
    assert.throws(() => readLock(dir, "scalar"), /not a JSON object/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("anyLocksCommitted: false for an absent/empty dir, true once a lock exists", () => {
  const dir = tmp();
  try {
    assert.equal(anyLocksCommitted(join(dir, "absent")), false); // !existsSync
    assert.equal(anyLocksCommitted(dir), false); // exists, empty
    writeFileSync(join(dir, "note.txt"), "x"); // a non-lock file doesn't count
    assert.equal(anyLocksCommitted(dir), false);
    writeLock(
      dir,
      buildLock({
        name: "e",
        inputsHash: "h",
        model: "m",
        harnessVersionKey: "",
        evalApiVersion: 1,
        builtAt: "2026-06-30T00:00:00.000Z",
        report: {},
      }),
    );
    assert.equal(anyLocksCommitted(dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("decideLock: off/update always run", () => {
  assert.deepEqual(decideLock("off", "e", "h", null), { kind: "run" });
  assert.deepEqual(decideLock("update", "e", "h", null), { kind: "run" });
});

test("decideLock check: missing lock → stale", () => {
  const d = decideLock("check", "my-eval", "h1", null);
  assert.equal(d.kind, "stale");
  assert.match((d as { reason: string }).reason, /missing/);
});

test("decideLock check: hash mismatch → stale", () => {
  const lock = {
    inputsHash: "OLD",
    report: { rate: 1 },
  } as unknown as EvalLock;
  const d = decideLock("check", "my-eval", "NEW", lock);
  assert.equal(d.kind, "stale");
  assert.match((d as { reason: string }).reason, /STALE|changed/);
});

test("decideLock check: hash match → replay the recorded report (no model)", () => {
  const report = { rate: 0.85, n: 10 };
  const lock = { inputsHash: "H", report } as unknown as EvalLock;
  const d = decideLock("check", "my-eval", "H", lock);
  assert.equal(d.kind, "replay");
  assert.deepEqual((d as { report: unknown }).report, report);
});

test("diffReportNumbers walks numeric leaves by path (works across report shapes)", () => {
  const before = {
    rate: 0.9,
    n: 20,
    perPrompt: [{ rate: 1 }, { rate: 0.5 }],
    precision: 1,
  };
  const after = {
    rate: 0.65,
    n: 20,
    perPrompt: [{ rate: 1 }, { rate: 0.25 }],
    precision: 1,
  };
  const deltas = diffReportNumbers(before, after);
  // rate + perPrompt[1].rate moved; n + precision + perPrompt[0].rate did not.
  assert.deepEqual(
    deltas.sort((a, b) => a.path.localeCompare(b.path)),
    [
      { path: "perPrompt[1].rate", before: 0.5, after: 0.25 },
      { path: "rate", before: 0.9, after: 0.65 },
    ],
  );
});

test("diffReportNumbers: identical reports yield no deltas", () => {
  const r = { rate: 0.9, arms: { run: { metrics: { ok: 1 } } } };
  assert.deepEqual(diffReportNumbers(r, structuredClone(r)), []);
});

test("formatLockUpdate: new vs unchanged vs moved", () => {
  assert.match(formatLockUpdate("e", [], true), /recorded NEW lock/);
  assert.match(formatLockUpdate("e", [], false), /no numeric change/);
  const moved = formatLockUpdate(
    "e",
    [{ path: "rate", before: 0.9, after: 0.65 }],
    false,
  );
  assert.match(moved, /▼ rate: 0\.900 → 0\.650/);
  assert.match(moved, /quality gate/);
});

test("lockModeFromEnv reads VIGILES_EVAL_LOCK; anything else → off", () => {
  assert.equal(lockModeFromEnv({ VIGILES_EVAL_LOCK: "check" }), "check");
  assert.equal(lockModeFromEnv({ VIGILES_EVAL_LOCK: "update" }), "update");
  assert.equal(lockModeFromEnv({ VIGILES_EVAL_LOCK: "garbage" }), "off");
  assert.equal(lockModeFromEnv({}), "off");
});

test("evalApiVersionFromEnv defaults to 1; tolerates a bad value", () => {
  assert.equal(evalApiVersionFromEnv({}), 1);
  assert.equal(evalApiVersionFromEnv({ VIGILES_EVAL_API_VERSION: "3" }), 3);
  assert.equal(evalApiVersionFromEnv({ VIGILES_EVAL_API_VERSION: "nope" }), 1);
  assert.equal(evalApiVersionFromEnv({ VIGILES_EVAL_API_VERSION: "-2" }), 1);
});
