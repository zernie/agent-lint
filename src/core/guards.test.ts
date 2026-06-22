/**
 * Guard prototype test suite (vitest): proves the typed vocabulary expresses the
 * real OSS hook cases + the new ORDER axis, decides correctly, and generates a
 * valid Claude Code hooks block. Pure, no model, no shell.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  guard,
  decideGuards,
  compileGuards,
  guardedTools,
  type Guard,
} from "./guards.js";

test("block: denies a matching tool call (reproduces pre-edit.sh's intent)", () => {
  const guards: Guard[] = [
    guard.block(
      { tool: "Edit", when: { file_path: /\.md$/ } },
      "compiled artifact — edit the .spec.ts instead",
    ),
  ];
  // Edit on a .md → blocked with the message.
  const denied = decideGuards(guards, {
    tool: "Edit",
    input: { file_path: "CLAUDE.md" },
  });
  assert.equal(denied.allow, false);
  assert.match(denied.reason ?? "", /edit the \.spec\.ts/);
  // Edit on a .ts → allowed (the `when` didn't match).
  assert.equal(
    decideGuards(guards, { tool: "Edit", input: { file_path: "a.ts" } }).allow,
    true,
  );
});

test("requireBefore (ORDER): destroy is denied until plan has fired", () => {
  const guards: Guard[] = [
    guard.requireBefore(
      { tool: "Bash", when: { command: /terraform destroy/ } },
      { tool: "Bash", when: { command: /terraform plan/ } },
      "`terraform destroy` requires a prior `terraform plan` this session",
    ),
  ];
  const destroy = {
    tool: "Bash",
    input: { command: "terraform destroy -auto-approve" },
  };

  // No prior plan → blocked.
  const blocked = decideGuards(guards, destroy, []);
  assert.equal(blocked.allow, false);
  assert.match(blocked.reason ?? "", /requires a prior `terraform plan`/);

  // After a plan call in the ledger → allowed.
  const ok = decideGuards(guards, destroy, [
    { tool: "Bash", input: { command: "terraform plan -out=tf.plan" } },
  ]);
  assert.equal(ok.allow, true);

  // The plan call itself is never gated.
  assert.equal(
    decideGuards(guards, { tool: "Bash", input: { command: "terraform plan" } })
      .allow,
    true,
  );
});

test("confine: denies a path-taking tool escaping the allowlist (rm -rf / class)", () => {
  const guards: Guard[] = [
    guard.confine(["Write", "Edit"], ["src/**", "test/**"]),
  ];
  // Inside the allowed set → ok.
  assert.equal(
    decideGuards(guards, { tool: "Write", input: { file_path: "src/x.ts" } })
      .allow,
    true,
  );
  // Outside (home dir) → denied.
  const escaped = decideGuards(guards, {
    tool: "Write",
    input: { file_path: "/home/user/.ssh/authorized_keys" },
  });
  assert.equal(escaped.allow, false);
  assert.match(escaped.reason ?? "", /outside the allowed set/);
});

test("compileGuards emits a valid CC hooks block pointing at vigiles's OWN gate", () => {
  const guards: Guard[] = [
    guard.block({ tool: "Edit", when: { file_path: /\.md$/ } }, "x"),
    guard.requireBefore(
      { tool: "Bash", when: { command: /destroy/ } },
      { tool: "Bash", when: { command: /plan/ } },
    ),
    guard.confine(["Write"], ["src/**"]),
  ];
  assert.deepEqual(guardedTools(guards), ["Bash", "Edit", "Write"]);

  const cfg = compileGuards(guards);
  const entry = cfg.hooks.PreToolUse[0];
  assert.equal(entry.matcher, "Bash|Edit|Write");
  // The command is vigiles's audited gate — NOT user shell (safe-by-construction).
  assert.equal(entry.hooks[0].command, "npx vigiles guard-hook");
  assert.equal(entry.hooks[0].type, "command");
});
