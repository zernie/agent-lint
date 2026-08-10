/**
 * Untested-surface detector test suite.
 *
 * Pure, filesystem-driven: build a tiny fake plugin in a tmp dir and assert the
 * two coverage detectors (colocation + content-reference), the user-invoked
 * exemption, the ignore-marker opt-out, hook-script discovery, and the report
 * formatting. No model, no network.
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

test("skill is covered by a content-reference anywhere (namespace token)", () => {
  const dir = makeTmpDir("tc-ref");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  // a test elsewhere that names the skill via its namespaced id
  write(dir, "test/foo.eval.mjs", 'skillResolved(t, "myplugin:foo");\n');
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0);
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
  // a unit test that drives only pre-edit by path
  write(dir, "src/hooks.test.ts", 'runHook("hooks/pre-edit.sh", {});\n');
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.total, 2);
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
  write(dir, "suite/foo.test.ts", 'import "../skills/foo/SKILL.md";\n');
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0, "content-reference covers the union");
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

test("a mention in CODE still counts — the zero-config path is kept, and labelled", () => {
  // The bare substring detector is deliberately RETAINED for code: it is what
  // makes an ordinary `foo.test.ts` naming `skills/foo` count without anyone
  // learning a marker. What it no longer reads is comments.
  const dir = makeTmpDir("cov-code-mention");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(dir, "test/foo.test.ts", 'loadSkill("skills/foo/SKILL.md");\n');
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0);
  assert.deepEqual(coverageEvidenceCounts(r), {
    declared: 0,
    colocated: 0,
    mention: 1,
  });
  cleanupTmpDir(dir);
});

test("a URL in a string literal survives comment-stripping", () => {
  // The stripper must not treat `//` inside a string as a comment opener, or a
  // fixture URL would swallow the rest of the line and drop real coverage.
  const dir = makeTmpDir("cov-url");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(
    dir,
    "test/foo.test.ts",
    'const u = "https://example.com"; loadSkill("skills/foo");\n',
  );
  assert.equal(findUntestedSurfaces({ basePath: dir }).untested.length, 0);
  cleanupTmpDir(dir);
});

test("a runtime-path harness that DECLARES its surfaces is counted", () => {
  // The false NEGATIVE half: this harness really does assert over both skills,
  // but assembles the paths at runtime, so it contains ZERO literal `skills/<name>`
  // strings. Substring matching can never see it; a declaration can.
  const dir = makeTmpDir("cov-declared");
  write(dir, "skills/alpha/SKILL.md", skill("alpha"));
  write(dir, "skills/beta/SKILL.md", skill("beta"));
  const runtimeHarness = [
    "import { join } from 'node:path';",
    "// vigiles:covers skills/alpha, skills/beta",
    "for (const name of ['alpha', 'beta']) {",
    "  assertFrontmatter(join(root, 'skills', name, 'SKILL.md'));",
    "}",
    "",
  ].join("\n");
  write(dir, "test/pipeline.harness.mjs", runtimeHarness);
  // The literal path exists ONLY on the declaration line: strike that line and
  // no substring detector could ever have found either skill.
  const codeOnly = runtimeHarness
    .split("\n")
    .filter((l) => !l.includes("vigiles:covers"))
    .join("\n");
  assert.ok(!codeOnly.includes("skills/alpha"), codeOnly);
  assert.ok(!codeOnly.includes("skills/beta"), codeOnly);

  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0, "both surfaces are covered");
  assert.deepEqual(coverageEvidenceCounts(r), {
    declared: 2,
    colocated: 0,
    mention: 0,
  });
  cleanupTmpDir(dir);
});

test("evidence provenance is REPORTED, and names the weakest case explicitly", () => {
  const dir = makeTmpDir("cov-provenance");
  write(dir, "skills/mentioned/SKILL.md", skill("mentioned"));
  write(dir, "test/a.test.ts", 'loadSkill("skills/mentioned");\n');
  const mentionOnly = formatUntestedReport(
    findUntestedSurfaces({ basePath: dir }),
  );
  assert.ok(mentionOnly.includes("How coverage was decided"), mentionOnly);
  assert.ok(
    mentionOnly.includes("ALL of it is a name appearing in a test file"),
    mentionOnly,
  );

  // Add a colocated test and the "all of it" escalation must drop away.
  write(dir, "skills/colo/SKILL.md", skill("colo"));
  write(dir, "skills/colo/colo.harness.mjs", "export default () => {};\n");
  const mixed = formatUntestedReport(findUntestedSurfaces({ basePath: dir }));
  assert.ok(mixed.includes("1 colocated"), mixed);
  assert.ok(!mixed.includes("ALL of it"), mixed);
  cleanupTmpDir(dir);
});

test("a declaration OUTRANKS a mention for the same surface", () => {
  // Provenance must not depend on glob order: the strongest evidence wins.
  const dir = makeTmpDir("cov-rank");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(dir, "test/a-mention.test.ts", 'loadSkill("skills/foo");\n');
  write(
    dir,
    "test/z-declared.harness.mjs",
    "// vigiles:covers skills/foo\nexport default () => {};\n",
  );
  const r = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(coverageEvidenceCounts(r), {
    declared: 1,
    colocated: 0,
    mention: 0,
  });
  assert.equal(r.decisions[0].by, "test/z-declared.harness.mjs");
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
