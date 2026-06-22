/**
 * Hook-spec SPIKE test suite (vitest): proves the compile step catches the two
 * silent hook footguns — wrong-field extraction (Check 1) and effect misdeclaration
 * ("type-safe bash", Check 2) — both at runtime (validateHook/compileHook) and, for
 * Check 1, at tsc time (hookFor + @ts-expect-error). Pure, no model, no shell.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  hook,
  hookFor,
  validateHook,
  compileHook,
  HookCompileError,
  type ToolFieldCatalog,
  type HookIssue,
} from "./hook-spec.js";

// The Claude Code tool_input field catalog (runtime) — injected, never in core.
const CC_FIELDS = {
  Bash: ["command", "description"],
  Edit: ["file_path", "old_string", "new_string"],
  Write: ["file_path", "content"],
  Read: ["file_path"],
} as const satisfies ToolFieldCatalog;

// The same catalog as a TYPE (tool → field-union) for the typed builder.
interface CCFieldMap {
  Bash: "command" | "description";
  Edit: "file_path" | "old_string" | "new_string";
  Write: "file_path" | "content";
  Read: "file_path";
}

const errs = (issues: HookIssue[]): string[] =>
  issues.filter((i) => i.severity === "error").map((i) => i.message);

// ---------------------------------------------------------------------------
// Check 1 — wrong-field extraction (the silent no-op)
// ---------------------------------------------------------------------------

test("Check 1: matching Bash but reading file_path is an error (always empty)", () => {
  const spec = hook({
    event: "PreToolUse",
    match: ["Bash"],
    reads: ["file_path"], // Bash events carry `command`, not `file_path`
    effect: "observe",
  });
  const issues = validateHook(spec, { toolFields: CC_FIELDS });
  assert.equal(errs(issues).length, 1);
  assert.match(errs(issues)[0], /no matched tool \(Bash\) provides it/);
  assert.match(errs(issues)[0], /silent no-op/);
});

test("Check 1: reading the right field is clean", () => {
  const spec = hook({
    event: "PreToolUse",
    match: ["Bash"],
    reads: ["command"],
    effect: "observe",
  });
  assert.deepEqual(validateHook(spec, { toolFields: CC_FIELDS }), []);
});

test("Check 1: a field present on SOME matched tools is a partial-empty warning", () => {
  const spec = hook({
    event: "PreToolUse",
    match: ["Edit", "Bash"], // file_path exists on Edit, not Bash
    reads: ["file_path"],
    effect: "observe",
  });
  const issues = validateHook(spec, { toolFields: CC_FIELDS });
  assert.equal(errs(issues).length, 0); // not an error (present on Edit)…
  assert.equal(issues.filter((i) => i.severity === "warning").length, 1);
  assert.match(issues[0].message, /Bash does not carry/);
});

// ---------------------------------------------------------------------------
// Check 2 — effect misdeclaration ("type-safe bash")
// ---------------------------------------------------------------------------

test("Check 2: an observe-only hook running a mutating command does not validate", () => {
  const spec = hook({
    event: "PreToolUse",
    match: ["Bash"],
    reads: ["command"],
    effect: "observe",
    run: "git push origin main", // side-effecting
  });
  const issues = validateHook(spec, { toolFields: CC_FIELDS });
  assert.equal(errs(issues).length, 1);
  assert.match(
    errs(issues)[0],
    /declared observe-only but its command is side-effecting/,
  );
});

test("Check 2: an observe-only hook running a read-only command is clean", () => {
  const spec = hook({
    event: "PreToolUse",
    match: ["Bash"],
    reads: ["command"],
    effect: "observe",
    run: "git status --porcelain",
  });
  assert.deepEqual(validateHook(spec, { toolFields: CC_FIELDS }), []);
});

test("Check 2: an undecidable command is rejected from an observe hook (fail-closed)", () => {
  const spec = hook({
    event: "PreToolUse",
    match: ["Bash"],
    reads: ["command"],
    effect: "observe",
    run: 'eval "$CMD"', // undecidable
  });
  assert.match(
    errs(validateHook(spec, { toolFields: CC_FIELDS }))[0],
    /undecidable/,
  );
});

test("Check 2: a mutate hook running the same command is fine (honest declaration)", () => {
  const spec = hook({
    event: "PostToolUse",
    match: ["Edit"],
    reads: ["file_path"],
    effect: "mutate",
    run: "git push origin main",
  });
  assert.deepEqual(validateHook(spec, { toolFields: CC_FIELDS }), []);
});

// ---------------------------------------------------------------------------
// Event check + compileHook (refuses to emit an unsafe hook)
// ---------------------------------------------------------------------------

test("unknown event is flagged when an events catalog is supplied", () => {
  const spec = hook({
    event: "PreToolUze", // typo
    match: ["Bash"],
    reads: ["command"],
    effect: "observe",
  });
  const issues = validateHook(spec, {
    toolFields: CC_FIELDS,
    events: ["PreToolUse", "PostToolUse"],
  });
  assert.match(errs(issues)[0], /unknown event "PreToolUze"/);
});

test("compileHook emits a block + typed extractions for a clean hook", () => {
  const spec = hook({
    event: "PreToolUse",
    match: ["Edit", "Write"],
    reads: ["file_path"],
    effect: "observe",
  });
  const out = compileHook(spec, { toolFields: CC_FIELDS });
  assert.equal(out.hooks.PreToolUse[0].matcher, "Edit|Write");
  assert.equal(
    out.hooks.PreToolUse[0].hooks[0].command,
    "npx vigiles guard-hook",
  );
  // The generated extraction reads the correct field — never a hand-typed jq string.
  assert.equal(out.extractions.file_path, ".tool_input.file_path");
});

test("compileHook REFUSES (throws) a wrong-field hook — unsafe doesn't compile", () => {
  const spec = hook({
    event: "PreToolUse",
    match: ["Bash"],
    reads: ["file_path"],
    effect: "observe",
  });
  assert.throws(
    () => compileHook(spec, { toolFields: CC_FIELDS }),
    HookCompileError,
  );
});

// ---------------------------------------------------------------------------
// Edit-time proof — hookFor makes a wrong field a tsc error (checked by `npm run build`)
// ---------------------------------------------------------------------------

test("hookFor: the right field type-checks", () => {
  const spec = hookFor<CCFieldMap, "Bash">({
    event: "PreToolUse",
    match: ["Bash"],
    reads: ["command"],
    effect: "observe",
  });
  assert.equal(spec.reads[0], "command");
});

test("hookFor: the wrong field is a COMPILE error (proven by @ts-expect-error)", () => {
  const spec = hookFor<CCFieldMap, "Bash">({
    event: "PreToolUse",
    match: ["Bash"],
    // @ts-expect-error — file_path is not a Bash tool_input field; won't tsc.
    reads: ["file_path"],
    effect: "observe",
  });
  // The runtime backstop agrees with the type.
  assert.equal(errs(validateHook(spec, { toolFields: CC_FIELDS })).length, 1);
});
