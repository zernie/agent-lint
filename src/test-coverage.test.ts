/**
 * Untested-surface detector test suite.
 *
 * Pure, filesystem-driven: build a tiny fake plugin in a tmp dir and assert the
 * ONE coverage detector (colocation), the user-invoked exemption, the
 * ignore-marker opt-out, hook-script discovery, and the report formatting. No
 * model, no network.
 *
 * Several tests here are INVERSIONS of ones that used to assert the opposite —
 * a name-mention and a `vigiles:covers` declaration both used to confer
 * coverage. They are kept as inversions rather than deleted so the removal is
 * pinned: a future re-introduction of either tier fails these.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  coverageEvidenceCounts,
  findUntestedSurfaces,
  formatUntestedReport,
  skillTestNudge,
  suggestedTestPath,
} from "./test-coverage.js";
import { surfaceSha } from "./coverage-artifact.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";
import { claudeCodeLayout } from "./adapters/claude-code/layout.js";

function write(dir: string, rel: string, content: string): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function skill(name: string, extra = ""): string {
  return `---\nname: ${name}\ndescription: A skill that does ${name} things for tests\n${extra}---\n\n# ${name}\n`;
}

test("surface discovery + hook-token are layout-driven (non-CC harness)", () => {
  // A harness with its OWN surface dirs and plugin-root token — proves the
  // de-CC-ing: skills/agents are found at the layout's dirs and a hook script is
  // resolved through the layout's token, NOT hard-coded `skills/`/`agents/`/
  // `${CLAUDE_PLUGIN_ROOT}`. (Regression guard for the scan.ts/test-coverage.ts
  // hard-codings.)
  const dir = makeTmpDir("tc-layout");
  write(dir, "mysurf/skill/foo/SKILL.md", skill("foo"));
  write(dir, "mysurf/agent/bar.md", skill("bar"));
  write(dir, "hooks/present.sh", "#!/bin/sh\n");
  write(
    dir,
    "my-manifest.json",
    JSON.stringify({
      hooks: {
        PostToolUse: [
          { hooks: [{ command: "$MY_PLUGIN_ROOT/hooks/present.sh" }] },
        ],
      },
    }),
  );

  const layout = {
    ...claudeCodeLayout,
    skillDir: "mysurf/skill",
    agentDir: "mysurf/agent",
    commandDir: "mysurf/command",
    materializeRoot: "",
    manifestPath: "my-manifest.json",
    pluginRootToken: "${MY_PLUGIN_ROOT}",
  };

  const r = findUntestedSurfaces({ basePath: dir, layout });
  const byKind = (k: string) =>
    r.untested.filter((s) => s.kind === k).map((s) => s.name);
  assert.deepEqual(byKind("skill"), ["foo"], "skill found at layout.skillDir");
  assert.deepEqual(byKind("agent"), ["bar"], "agent found at layout.agentDir");
  assert.deepEqual(
    byKind("hook"),
    ["present"],
    "hook resolved via layout.pluginRootToken (unbraced $MY_PLUGIN_ROOT)",
  );

  // The default Claude Code layout sees none of it (different dirs/token).
  assert.equal(findUntestedSurfaces({ basePath: dir }).total, 0);
  cleanupTmpDir(dir);
});

test("skill is covered by a colocated eval", () => {
  const dir = makeTmpDir("tc-coloc");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(dir, "skills/foo/foo.eval.mjs", "// trigger eval\n");
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0);
  assert.deepEqual(
    r.covered.map((s) => s.name),
    ["foo"],
  );
  cleanupTmpDir(dir);
});

test("loose skill under .claude/skills is covered by its colocated eval", () => {
  // Regression: the suggested eval lives under a DOT dir, so a globstar test
  // glob without `dot:true` never found it and the surface looked untested
  // even after the user added exactly the file the warning recommended.
  const dir = makeTmpDir("tc-dotdir");
  write(dir, ".claude/skills/foo/SKILL.md", skill("foo"));
  const before = findUntestedSurfaces({ basePath: dir });
  assert.equal(before.untested.length, 1, "skill is found and flagged first");
  assert.equal(
    suggestedTestPath(before.untested[0]),
    ".claude/skills/foo/foo.eval.mjs",
  );

  // Add exactly the suggested colocated eval — it must now count as covered.
  write(dir, ".claude/skills/foo/foo.eval.mjs", "// trigger eval\n");
  const after = findUntestedSurfaces({ basePath: dir });
  assert.equal(after.untested.length, 0);
  assert.deepEqual(
    after.covered.map((s) => s.name),
    ["foo"],
  );
  cleanupTmpDir(dir);
});

test("a test that only NAMES the skill does NOT cover it", () => {
  // Was "content-reference covers it". Inverted 2026-08-11: naming a surface is
  // not testing it, and the tier that believed otherwise supplied 9 of vigiles's
  // own 10 covered surfaces with at least three of them false.
  const dir = makeTmpDir("tc-ref");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(dir, "test/foo.eval.mjs", 'skillResolved(t, "myplugin:foo");\n');
  const r = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    r.untested.map((x) => x.name),
    ["foo"],
  );
  cleanupTmpDir(dir);
});

test("skill with no test is flagged", () => {
  const dir = makeTmpDir("tc-untested");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 1);
  assert.equal(r.untested[0].name, "foo");
  cleanupTmpDir(dir);
});

test("a command-only (disable-model-invocation) skill is NOT exempt — it still needs a test", () => {
  const dir = makeTmpDir("tc-userinvoked");
  write(
    dir,
    "skills/cmd/SKILL.md",
    skill("cmd", "disable-model-invocation: true\n"),
  );
  const r = findUntestedSurfaces({ basePath: dir });
  // Invocation mode no longer exempts anything: the command-only skill is held
  // to the requirement like any other and flagged when it has no test.
  assert.equal(r.total, 1);
  assert.equal(r.exempt, 0);
  assert.equal(r.untested.length, 1);
  assert.equal(r.untested[0].name, "cmd");
  cleanupTmpDir(dir);
});

test("vigiles:ignore-test marker is the only exemption (and is counted)", () => {
  const dir = makeTmpDir("tc-ignore");
  write(
    dir,
    "skills/foo/SKILL.md",
    skill("foo") + "\n<!-- vigiles:ignore-test -->\n",
  );
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.total, 0); // nothing held to the requirement
  assert.equal(r.exempt, 1); // the explicit opt-out is visible, not silent
  assert.equal(r.untested.length, 0);
  cleanupTmpDir(dir);
});

test("agent is covered by a name-prefixed sibling, flagged otherwise", () => {
  const dir = makeTmpDir("tc-agent");
  write(dir, "agents/planner.md", "---\nname: planner\n---\nbody\n");
  write(dir, "agents/reviewer.md", "---\nname: reviewer\n---\nbody\n");
  write(dir, "agents/planner.harness.mjs", "// planner test\n");
  const r = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    r.covered.map((s) => s.name),
    ["planner"],
  );
  assert.deepEqual(
    r.untested.map((s) => s.name),
    ["reviewer"],
  );
  cleanupTmpDir(dir);
});

test("hook scripts are discovered from plugin.json and matched by path", () => {
  const dir = makeTmpDir("tc-hooks");
  write(dir, "hooks/pre-edit.sh", "#!/usr/bin/env bash\n");
  write(dir, "hooks/post-edit.sh", "#!/usr/bin/env bash\n");
  write(
    dir,
    ".claude-plugin/plugin.json",
    JSON.stringify({
      name: "p",
      hooks: {
        PreToolUse: [
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "bash ${CLAUDE_PLUGIN_ROOT}/hooks/pre-edit.sh",
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "bash ${CLAUDE_PLUGIN_ROOT}/hooks/post-edit.sh",
              },
            ],
          },
        ],
      },
    }),
  );
  // A unit test elsewhere that drives pre-edit BY PATH now covers nothing —
  // naming a hook is not testing it. This is the exact shape by which the
  // detector's own suite used to grant coverage to these two hooks.
  write(dir, "src/hooks.test.ts", 'runHook("hooks/pre-edit.sh", {});\n');
  let r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.total, 2);
  assert.deepEqual(r.untested.map((s) => s.name).sort(), [
    "post-edit",
    "pre-edit",
  ]);

  // A hook is covered by a name-prefixed SIBLING — placement, not mention.
  write(dir, "hooks/pre-edit.harness.mjs", "assert.ok(true);\n");
  r = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    r.covered.map((s) => s.name),
    ["pre-edit"],
  );
  assert.deepEqual(
    r.untested.map((s) => s.name),
    ["post-edit"],
  );
  cleanupTmpDir(dir);
});

test("per-surface kind toggles disable scanning", () => {
  const dir = makeTmpDir("tc-toggle");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  const r = findUntestedSurfaces({ basePath: dir, skills: false });
  assert.equal(r.total, 0);
  cleanupTmpDir(dir);
});

test("formatUntestedReport: clean vs flagged, suggestedTestPath", () => {
  const dir = makeTmpDir("tc-fmt");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  const flagged = findUntestedSurfaces({ basePath: dir });
  const text = formatUntestedReport(flagged);
  assert.ok(text.includes("1 surface(s) with no test"));
  assert.ok(text.includes("skills/foo/foo.eval.mjs"));
  // The footer points at testGlobs for an external test loop (issue #113).
  assert.ok(text.includes("testGlobs"));
  assert.equal(
    suggestedTestPath(flagged.untested[0]),
    "skills/foo/foo.eval.mjs",
  );

  write(dir, "skills/foo/foo.eval.mjs", "// covered\n");
  const clean = findUntestedSurfaces({ basePath: dir });
  assert.ok(formatUntestedReport(clean).startsWith("✓"));
  cleanupTmpDir(dir);
});

test("discovers a bare SKILL.md AT the base (single-skill-dir target)", () => {
  // When lint/audit is pointed at one skill dir, the SKILL.md is at the base
  // itself, not under `skills/*/`. Without this the untested-skill check would
  // silently vanish for exactly that target.
  const dir = makeTmpDir("cov-solo");
  write(dir, "SKILL.md", "---\nname: solo\ndescription: x\n---\nbody\n");
  const report = findUntestedSurfaces({ basePath: dir });
  const found = report.untested.find((s) => s.kind === "skill");
  assert.ok(found, "the root SKILL.md is reported as an untested skill");
  assert.equal(found.path, "SKILL.md");
  cleanupTmpDir(dir);
});

test("a root SKILL.md is COVERED by a colocated eval (single-skill-dir target)", () => {
  // A colocated `solo.eval.mjs` beside a root SKILL.md must count as coverage —
  // globSync returns it without a "./" prefix, which the colocation check now
  // handles for a "." dir. Else the documented single-skill target false-fails CI.
  const dir = makeTmpDir("cov-solo-eval");
  write(dir, "SKILL.md", "---\nname: solo\ndescription: x\n---\nbody\n");
  write(dir, "solo.eval.mjs", "// colocated eval\n");
  const report = findUntestedSurfaces({ basePath: dir });
  assert.equal(
    report.untested.filter((s) => s.kind === "skill").length,
    0,
    "the colocated solo.eval.mjs covers the root SKILL.md",
  );
  cleanupTmpDir(dir);
});

// ── Two tiers, split at DISCOVERY ────────────────────────────────────────────
// A harness (`*.harness.mjs`, `*.test.*`) is free and runs on every push; an eval
// (`*.eval.mjs`) spends real model calls on a schedule and is the ONLY thing that
// answers "does this skill fire?". Erasing that at discovery makes it
// unrecoverable downstream — hence a per-tier split, not a display tweak.

test("tiers split at discovery: a harness-only skill is NOT evaluated, and vice versa", () => {
  const dir = makeTmpDir("cov-tiers");
  write(dir, "skills/harnessed/SKILL.md", skill("harnessed"));
  write(dir, "skills/harnessed/harnessed.harness.mjs", "// deterministic\n");
  write(dir, "skills/evaled/SKILL.md", skill("evaled"));
  write(dir, "skills/evaled/evaled.eval.mjs", "// real model\n");
  write(dir, "skills/bare/SKILL.md", skill("bare"));

  const r = findUntestedSurfaces({ basePath: dir });
  const names = (ss: readonly { name: string }[]) =>
    ss.map((s) => s.name).sort();

  // The UNION is unchanged: a test anywhere counts.
  assert.deepEqual(names(r.untested), ["bare"]);
  assert.deepEqual(names(r.covered), ["evaled", "harnessed"]);

  // The tiers disagree, which is the whole point — "has deterministic coverage,
  // no evals" is a different position from "has neither".
  assert.deepEqual(names(r.harness.covered), ["harnessed"]);
  assert.deepEqual(names(r.harness.untested), ["bare", "evaled"]);
  assert.deepEqual(names(r.evals.covered), ["evaled"]);
  assert.deepEqual(names(r.evals.untested), ["bare", "harnessed"]);
  cleanupTmpDir(dir);
});

test("a `*.test.ts` is a HARNESS, never an eval (it spends no model calls)", () => {
  const dir = makeTmpDir("cov-tier-ts");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  // Colocated, since placement is what counts — a `.test.ts` in a far-off suite
  // covers nothing regardless of which tier it would land in.
  write(dir, "skills/foo/foo.test.ts", 'import "./SKILL.md";\n');
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0, "colocated test covers the union");
  assert.equal(r.harness.untested.length, 0, "…and the deterministic tier");
  assert.deepEqual(
    r.evals.untested.map((s) => s.name),
    ["foo"],
    "but firing is still unmeasured — a .test.ts cannot answer that",
  );
  cleanupTmpDir(dir);
});

test("a clean UNION still says when nothing has measured firing", () => {
  // Every surface has a deterministic harness, so the gate passes — but no
  // `*.eval.mjs` exists, so nothing has measured that the skill fires. A bare ✓
  // there would read as "firing verified" when the question was never asked.
  const dir = makeTmpDir("cov-clean-noeval");
  write(dir, "skills/a/SKILL.md", skill("a"));
  write(dir, "skills/a/a.harness.mjs", "// deterministic only\n");
  const harnessOnly = formatUntestedReport(
    findUntestedSurfaces({ basePath: dir }),
  );
  assert.ok(harnessOnly.startsWith("✓"), harnessOnly);
  assert.ok(harnessOnly.includes("no `*.eval.mjs`"), harnessOnly);
  assert.ok(harnessOnly.includes("actually fire"), harnessOnly);

  // Add the eval and the caveat disappears — a plain ✓, nothing left unasked.
  write(dir, "skills/a/a.eval.mjs", "// real model\n");
  const both = formatUntestedReport(findUntestedSurfaces({ basePath: dir }));
  assert.ok(both.startsWith("✓"), both);
  assert.ok(!both.includes("eval.mjs`"), both);
  cleanupTmpDir(dir);
});

test("formatUntestedReport names the two gaps SEPARATELY (no test/eval slash)", () => {
  const dir = makeTmpDir("cov-tier-fmt");
  write(dir, "skills/a/SKILL.md", skill("a"));
  write(dir, "skills/a/a.harness.mjs", "// deterministic only\n");
  write(dir, "skills/b/SKILL.md", skill("b"));
  const text = formatUntestedReport(findUntestedSurfaces({ basePath: dir }));
  // Only `b` is in the union list…
  assert.ok(text.includes("1 surface(s) with no test"));
  // …but the breakdown says 1 needs a harness and 2 need firing measured, with
  // the cost of each named. One number could not have said that.
  assert.ok(
    text.includes(
      "Two gaps, two costs: 1 with no deterministic harness (free, every push) · 2 whose firing was never measured",
    ),
    text,
  );
  cleanupTmpDir(dir);
});

// ── Evidence: a STRING is not a test ─────────────────────────────────────────
// The detector used to count any occurrence of a surface's path/namespace ANYWHERE
// in a discovered test file. Measured on a real repo (37 skills, 14 hooks),
// appending one COMMENT line — `// probe: skills/argument-arc` — moved the
// untested count 33 → 32. Meanwhile a harness that genuinely asserts over 21
// skills but builds its paths at runtime contained no literal `skills/<name>` and
// covered nothing: generality was penalised, gaming was free.

test("a surface named ONLY in a comment is NOT covered (the one-line probe)", () => {
  const dir = makeTmpDir("cov-comment-probe");
  write(dir, "skills/argument-arc/SKILL.md", skill("argument-arc"));
  // Verbatim shape of the reproduction: a real harness file, plus a comment that
  // happens to spell the surface's path. Nothing asserts anything about it.
  write(
    dir,
    "test/pipeline.harness.mjs",
    [
      "import { readFileSync } from 'node:fs';",
      "// probe: skills/argument-arc",
      "export default () => readFileSync('unrelated.txt');",
      "",
    ].join("\n"),
  );
  const r = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    r.untested.map((s) => s.name),
    ["argument-arc"],
    "a comment is prose about a test, not a test",
  );
  cleanupTmpDir(dir);
});

test("a declaration cannot confer coverage on a file that asserts nothing", () => {
  // The lie this removal exists to stop: a file whose entire content is a
  // `vigiles:covers` comment used to report BOTH surfaces as tested.
  const dir = makeTmpDir("cov-liar");
  write(dir, "skills/alpha/SKILL.md", skill("alpha"));
  write(dir, "skills/beta/SKILL.md", skill("beta"));
  write(
    dir,
    "test/liar.harness.mjs",
    "// vigiles:covers skills/alpha, skills/beta\n",
  );
  const r = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(r.untested.map((x) => x.name).sort(), ["alpha", "beta"]);
  cleanupTmpDir(dir);
});

test("coverage cannot be changed by editing text INSIDE a test file", () => {
  // Placement decides coverage now, so the detector never reads a test's
  // contents — which is what made the old metric editable by one comment line.
  const dir = makeTmpDir("cov-content-blind");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(
    dir,
    "test/foo.test.ts",
    'loadSkill("skills/foo"); // vigiles:covers skills/foo\n',
  );
  assert.equal(findUntestedSurfaces({ basePath: dir }).untested.length, 1);
  cleanupTmpDir(dir);
});

test("a runtime-path harness covers nothing until its tests are colocated", () => {
  // The honest cost of colocation-only, pinned rather than hidden: a harness
  // that really does assert over both skills but assembles paths at runtime
  // counts for neither. The fix is a test inside each skill's directory, not a
  // marker claiming credit from afar.
  const dir = makeTmpDir("cov-runtime");
  write(dir, "skills/alpha/SKILL.md", skill("alpha"));
  write(dir, "skills/beta/SKILL.md", skill("beta"));
  write(
    dir,
    "test/pipeline.harness.mjs",
    [
      "// vigiles:covers skills/alpha, skills/beta",
      "for (const name of ['alpha', 'beta']) {",
      "  assertFrontmatter(join(root, 'skills', name, 'SKILL.md'));",
      "}",
      "",
    ].join("\n"),
  );
  assert.equal(findUntestedSurfaces({ basePath: dir }).untested.length, 2);

  // Colocate one, and exactly one flips.
  write(dir, "skills/alpha/alpha.harness.mjs", "assert.ok(true);\n");
  const after = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    after.untested.map((x) => x.name),
    ["beta"],
  );
  assert.deepEqual(coverageEvidenceCounts(after), {
    executed: 0,
    colocated: 1,
  });
  cleanupTmpDir(dir);
});

test("provenance is reported, and says placement is not proof of a run", () => {
  const dir = makeTmpDir("cov-provenance");
  write(dir, "skills/covered/SKILL.md", skill("covered"));
  write(dir, "skills/covered/covered.eval.mjs", "assert.ok(true);\n");
  const report = formatUntestedReport(findUntestedSurfaces({ basePath: dir }));
  assert.match(report, /1 colocated/);
  // The remaining hole is NAMED in the output rather than left for the reader
  // to discover: an empty colocated file still counts.
  assert.match(report, /EXISTS, not/);
  cleanupTmpDir(dir);
});

test("an EMPTY colocated file still counts — the known, reported hole", () => {
  // Pinned deliberately, and still true of the FALLBACK tier: colocation proves
  // placement, not execution. What changed on 2026-08-11 is that a recorded run
  // OUTRANKS it (the `executed` block at the end of this file), so a surface
  // answered by colocation is one that nothing has ever been run against. The
  // report says so out loud, so the number is not read as more than it is.
  const dir = makeTmpDir("cov-empty");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(dir, "skills/foo/foo.eval.mjs", "");
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0);
  assert.deepEqual(coverageEvidenceCounts(r), { executed: 0, colocated: 1 });
  cleanupTmpDir(dir);
});

// ---------------------------------------------------------------------------
// skillTestNudge — the edit-time delivery of `untested-skill`.
//
// The rule was already stated correctly; it only ever ran inside `vigiles lint`,
// which someone has to type. These pin the four behaviours that make the nudge
// worth wiring: it fires on an untested surface, it distinguishes "never
// evaluated" from "no test at all", it stays silent when covered, and it always
// hands off to the `test-harness` skill rather than restating "write a test".
// ---------------------------------------------------------------------------

test("skillTestNudge: an untested skill gets a nudge that names the test-harness skill", () => {
  const dir = makeTmpDir("nudge-untested");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  const msg = skillTestNudge("skills/foo/SKILL.md", { basePath: dir });
  assert.ok(msg, "an untested skill must produce a nudge");
  // The load-bearing property: it points at the vocabulary, not at the duty.
  assert.match(msg, /test-harness/);
  assert.match(msg, /measureTriggerRate/);
  // …and it tells the agent where to put the result.
  assert.match(msg, /skills\/foo\/foo\.eval\.mjs/);
  // A nudge must never read as a gate.
  assert.match(msg, /not a block/);
  cleanupTmpDir(dir);
});

test("skillTestNudge: a harness-covered skill is nudged about FIRING, not about tests", () => {
  // The case an edit to a SKILL.md usually IS: the description (= the trigger
  // surface) changed, and a deterministic harness structurally cannot tell you
  // whether it still fires.
  const dir = makeTmpDir("nudge-uneval");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(dir, "skills/foo/foo.harness.mjs", "// vigiles:covers skills/foo\n");
  const msg = skillTestNudge("skills/foo/SKILL.md", { basePath: dir });
  assert.ok(msg, "covered-but-never-evaluated must still nudge");
  assert.match(msg, /FIRES/);
  assert.match(msg, /measureTriggerRate/);
  // It must NOT claim the surface is untested — it isn't.
  assert.doesNotMatch(msg, /no test or eval covers it/);
  cleanupTmpDir(dir);
});

test("skillTestNudge: silent when the surface is covered on both tiers", () => {
  const dir = makeTmpDir("nudge-covered");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(dir, "skills/foo/foo.harness.mjs", "// vigiles:covers skills/foo\n");
  write(dir, "skills/foo/foo.eval.mjs", "// vigiles:covers skills/foo\n");
  assert.equal(skillTestNudge("skills/foo/SKILL.md", { basePath: dir }), null);
  cleanupTmpDir(dir);
});

test("skillTestNudge: silent for a file that is not a surface, and for another skill's edit", () => {
  const dir = makeTmpDir("nudge-other");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(dir, "README.md", "# not a surface\n");
  assert.equal(skillTestNudge("README.md", { basePath: dir }), null);
  // An absolute-ish path ending in the surface path still matches (the hook
  // passes a repo-relative path, but a caller may not).
  assert.ok(skillTestNudge("/abs/repo/skills/foo/SKILL.md", { basePath: dir }));
  cleanupTmpDir(dir);
});

test("skillTestNudge: an agent surface is covered too, and a broken scan is silent", () => {
  const dir = makeTmpDir("nudge-agent");
  write(dir, "agents/bar.md", skill("bar"));
  const msg = skillTestNudge("agents/bar.md", { basePath: dir });
  assert.ok(msg);
  assert.match(msg, /bar\.harness\.mjs/); // agents suggest a harness, not an eval
  // A nonexistent base must not throw out of a PostToolUse hook.
  assert.equal(
    skillTestNudge("skills/foo/SKILL.md", { basePath: join(dir, "nope") }),
    null,
  );
  cleanupTmpDir(dir);
});

// ── colocation must be NAMED, not merely nearby (defect found by dogfooding) ──
// Placement says where a file sits; only the name says what it is about. The rule
// read "any file under the skill's directory", which is the substitution the
// removed `mention` tier made, reached by a different route. Observed live: a
// consumer repo's `paper-pipeline/` held SIX evals, exactly one about that skill,
// the rest sitting there for a historical reason — and the orchestrator scored as
// covered with no test of its own.

test("a test named after ANOTHER skill does not cover the one it sits with", () => {
  const dir = makeTmpDir("cov-foreign");
  write(dir, ".claude/skills/orchestrator/SKILL.md", skill("orchestrator"));
  write(dir, ".claude/skills/grader/SKILL.md", skill("grader"));
  // The historical accident: a test ABOUT `grader`, living in `orchestrator/`.
  write(
    dir,
    ".claude/skills/orchestrator/grader-ablation.eval.mjs",
    "// about grader\n",
  );
  const report = findUntestedSurfaces({ basePath: dir });
  const untested = report.untested.map((s) => s.name).sort();
  assert.deepEqual(untested, ["grader", "orchestrator"]);
  cleanupTmpDir(dir);
});

test("…and its own, correctly named test still covers it", () => {
  // The quiet half. Without it the assertion above passes on a detector that
  // credits nothing at all, which is the failure mode this suite exists to catch.
  const dir = makeTmpDir("cov-own-name");
  write(dir, ".claude/skills/orchestrator/SKILL.md", skill("orchestrator"));
  write(
    dir,
    ".claude/skills/orchestrator/orchestrator.eval.mjs",
    "// about orchestrator\n",
  );
  const report = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    report.untested.map((s) => s.name),
    [],
  );
  assert.equal(coverageEvidenceCounts(report).colocated, 1);
  cleanupTmpDir(dir);
});

test("a test in a SUBDIRECTORY is not colocated, however well named", () => {
  // Colocation is worth having for one property: `ls` answers "is this tested?".
  // Permit a subdirectory and it takes `find` instead — and two permitted shapes
  // is a choice at write time and a lookup at read time.
  //
  // Measured before removing the allowance: across two real repos exactly ONE
  // nested test exists, `verify-citations/scripts/verify-cites.test.mjs` — a unit
  // test for a script the skill BUNDLES, not a test of the skill. It credited
  // nothing anyone wanted.
  const dir = makeTmpDir("cov-nested");
  write(dir, ".claude/skills/foo/SKILL.md", skill("foo"));
  write(dir, ".claude/skills/foo/tests/foo.harness.mjs", "// about foo\n");
  const report = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    report.untested.map((s) => s.name),
    ["foo"],
  );
  cleanupTmpDir(dir);
});

test("…and a bundled script's own unit test does not credit the skill either", () => {
  // The real case above, reproduced: `scripts/<script>.test.mjs` pins a pure
  // reducer the skill ships. A good test of a script is not a test of a skill.
  const dir = makeTmpDir("cov-script-test");
  write(
    dir,
    ".claude/skills/verify-citations/SKILL.md",
    skill("verify-citations"),
  );
  write(
    dir,
    ".claude/skills/verify-citations/scripts/verify-cites.test.mjs",
    "// pure reducer\n",
  );
  const report = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    report.untested.map((s) => s.name),
    ["verify-citations"],
  );
  cleanupTmpDir(dir);
});

test("a single-skill target takes its identity from `name:`, not the checkout dir", () => {
  // The base of a single-skill target is wherever the thing happens to be checked
  // out — a temp dir, a CI workspace. Deriving the identity from the path would
  // ask the author to name their test after their checkout directory.
  const dir = makeTmpDir("cov-root-identity");
  write(dir, "SKILL.md", skill("solo"));
  write(dir, "solo.eval.mjs", "// about solo\n");
  const report = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    report.untested.map((s) => s.name),
    [],
  );
  cleanupTmpDir(dir);
});

// ── the retired `vigiles:covers` marker explains its own removal ──────────────
// Up to 15.0.2 the untested finding TOLD people to write this marker. Removing
// the tier without a word means anyone who complied loses coverage on upgrade
// with no error — the marker quietly becomes a comment. A migration nobody is
// told about is indistinguishable from a bug they caused.

test("a test still carrying `vigiles:covers` is named, with what changed", () => {
  const dir = makeTmpDir("cov-legacy-marker");
  write(dir, ".claude/skills/foo/SKILL.md", skill("foo"));
  write(
    dir,
    ".claude/skills/foo/foo.harness.mjs",
    `// vigiles:${"covers"} skills/foo\n`,
  );
  const report = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(report.legacyCoversFiles, [
    ".claude/skills/foo/foo.harness.mjs",
  ]);
  const text = formatUntestedReport(report);
  assert.match(text, /retired/);
  // Printed even though this repo is at ZERO untested — a repo can lose the tier
  // and still be clean, and would then never hear about it.
  assert.equal(report.untested.length, 0);
  cleanupTmpDir(dir);
});

test("…and a repo that never used the marker hears nothing about it", () => {
  const dir = makeTmpDir("cov-no-legacy");
  write(dir, ".claude/skills/foo/SKILL.md", skill("foo"));
  write(dir, ".claude/skills/foo/foo.harness.mjs", "// an ordinary test\n");
  const report = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(report.legacyCoversFiles, []);
  assert.doesNotMatch(formatUntestedReport(report), /retired/);
  cleanupTmpDir(dir);
});

// ── the EXECUTION tier: `.vigiles/coverage.json` ─────────────────────────────
//
// The order of answers is execution → name → nothing, and the report must say
// which one it used. Each behaviour below has both halves: it fires with an
// artifact present, and the corpus is untouched when there is none — a fresh
// clone and somebody else's repo must not get one extra nudge from this tier.

/** Write a run artifact naming `surfacePath` as exercised by `by`. */
function artifact(
  dir: string,
  entries: readonly {
    path: string;
    name: string;
    sha: string;
    tier?: "harness" | "eval";
    by?: string;
    at?: string;
    kind?: "skill" | "agent" | "hook";
  }[],
): void {
  write(
    dir,
    ".vigiles/coverage.json",
    JSON.stringify({
      v: 1,
      generated: "2026-08-11T10:00:00.000Z",
      runs: entries.map((e) => ({
        kind: e.kind ?? "skill",
        path: e.path,
        name: e.name,
        tier: e.tier ?? "harness",
        how: "fired",
        by: e.by ?? "runner.harness.mjs",
        at: e.at ?? "2026-08-11T10:00:00.000Z",
        sha: e.sha,
      })),
    }),
  );
}

test("a recorded run covers a surface that has NO file named after it", () => {
  // The whole point: `skills.harness.mjs` builds its paths at runtime and
  // contains no literal `skills/<name>`, so colocation credits it with nothing.
  // A run says otherwise, and the run is the thing that happened.
  const dir = makeTmpDir("cov-exec");
  const body = skill("alpha");
  write(dir, "skills/alpha/SKILL.md", body);
  write(dir, "test/pipeline.harness.mjs", "// builds paths at runtime\n");
  assert.equal(findUntestedSurfaces({ basePath: dir }).untested.length, 1);

  artifact(dir, [
    { path: "skills/alpha/SKILL.md", name: "alpha", sha: surfaceSha(body) },
  ]);
  const after = findUntestedSurfaces({ basePath: dir });
  assert.equal(after.untested.length, 0);
  assert.deepEqual(coverageEvidenceCounts(after), {
    executed: 1,
    colocated: 0,
  });
  cleanupTmpDir(dir);
});

test("execution OUTRANKS colocation, and the report words them differently", () => {
  const dir = makeTmpDir("cov-exec-rank");
  const alpha = skill("alpha");
  const beta = skill("beta");
  write(dir, "skills/alpha/SKILL.md", alpha);
  write(dir, "skills/alpha/alpha.harness.mjs", "assert.ok(true);\n");
  write(dir, "skills/beta/SKILL.md", beta);
  write(dir, "skills/beta/beta.harness.mjs", ""); // an EMPTY file still colocates
  artifact(dir, [
    { path: "skills/alpha/SKILL.md", name: "alpha", sha: surfaceSha(alpha) },
  ]);
  const r = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(coverageEvidenceCounts(r), { executed: 1, colocated: 1 });
  const text = formatUntestedReport(r);
  // "measured by a run" and "there is a file with a matching name" are two
  // different facts. A reader who cannot tell them apart has the old number.
  assert.match(text, /1 MEASURED BY A RUN/);
  assert.match(text, /1 colocated/);
  assert.match(text, /EXISTS, not that it ran/);
  cleanupTmpDir(dir);
});

test("a run against OLDER text grants nothing, and says so out loud", () => {
  const dir = makeTmpDir("cov-stale");
  write(dir, "skills/alpha/SKILL.md", skill("alpha"));
  artifact(dir, [
    {
      path: "skills/alpha/SKILL.md",
      name: "alpha",
      sha: surfaceSha("the text it had LAST week"),
    },
  ]);
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 1, "a stale run is not coverage");
  assert.deepEqual(
    (r.staleRuns ?? []).map((s) => s.path),
    ["skills/alpha/SKILL.md"],
  );
  // Silently counting it is the PIPELINE-STATUS disease — a tick against a
  // document somebody rewrote afterwards.
  assert.match(formatUntestedReport(r), /BEFORE their current/);
  cleanupTmpDir(dir);
});

test("a stale run is reported even when the repo is at ZERO untested", () => {
  // Same reason `legacyCoversNote` prints in both branches: a repo can be clean
  // and still be resting on a measurement of text that no longer exists.
  const dir = makeTmpDir("cov-stale-clean");
  write(dir, "skills/alpha/SKILL.md", skill("alpha"));
  write(dir, "skills/alpha/alpha.harness.mjs", "assert.ok(true);\n");
  artifact(dir, [
    { path: "skills/alpha/SKILL.md", name: "alpha", sha: surfaceSha("older") },
  ]);
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0);
  assert.match(formatUntestedReport(r), /BEFORE their current/);
  cleanupTmpDir(dir);
});

test("a re-run refreshes the surface and the stale notice goes away", () => {
  const dir = makeTmpDir("cov-stale-refresh");
  const body = skill("alpha");
  write(dir, "skills/alpha/SKILL.md", body);
  // The artifact keeps the old record AND a fresh one, as merging leaves it.
  artifact(dir, [
    {
      path: "skills/alpha/SKILL.md",
      name: "alpha",
      sha: surfaceSha("older"),
      by: "old.harness.mjs",
      at: "2026-08-01T00:00:00.000Z",
    },
    {
      path: "skills/alpha/SKILL.md",
      name: "alpha",
      sha: surfaceSha(body),
      by: "new.harness.mjs",
    },
  ]);
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0);
  assert.deepEqual(r.staleRuns, [], "a permanent notice is an ignored notice");
  assert.deepEqual(coverageEvidenceCounts(r), { executed: 1, colocated: 0 });
  cleanupTmpDir(dir);
});

test("an executed HARNESS does not silence `firing was never measured`", () => {
  // The tiers cost three orders of magnitude apart. A free deterministic run
  // must not answer the question only a real model can.
  const dir = makeTmpDir("cov-exec-tier");
  const body = skill("alpha");
  write(dir, "skills/alpha/SKILL.md", body);
  artifact(dir, [
    {
      path: "skills/alpha/SKILL.md",
      name: "alpha",
      sha: surfaceSha(body),
      tier: "harness",
    },
  ]);
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.harness.untested.length, 0);
  assert.equal(r.evals.untested.length, 1);
  assert.match(formatUntestedReport(r), /no `\*\.eval\.mjs`|never measured/);
  cleanupTmpDir(dir);
});

test("NO artifact ⇒ byte-for-byte the old behaviour, including the report text", () => {
  // The conservative direction, pinned. A fresh clone and anyone else's repo
  // must not get one extra nudge, or one fewer, from this tier existing.
  const dir = makeTmpDir("cov-no-artifact");
  write(dir, "skills/alpha/SKILL.md", skill("alpha"));
  write(dir, "skills/beta/SKILL.md", skill("beta"));
  write(dir, "skills/beta/beta.harness.mjs", "assert.ok(true);\n");
  const r = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    r.untested.map((s) => s.name),
    ["alpha"],
  );
  assert.deepEqual(coverageEvidenceCounts(r), { executed: 0, colocated: 1 });
  const text = formatUntestedReport(r);
  assert.doesNotMatch(text, /MEASURED BY A RUN/);
  assert.doesNotMatch(text, /BEFORE their current/);
  cleanupTmpDir(dir);
});

test("a run record for a surface nobody discovers changes nothing", () => {
  const dir = makeTmpDir("cov-ghost");
  write(dir, "skills/alpha/SKILL.md", skill("alpha"));
  artifact(dir, [
    { path: "skills/deleted/SKILL.md", name: "deleted", sha: "whatever" },
  ]);
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 1);
  assert.deepEqual(r.staleRuns, []);
  cleanupTmpDir(dir);
});
