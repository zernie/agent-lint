/**
 * `vigiles scan` test suite. Builds a tiny fake plugin in a tmp dir and asserts
 * the deterministic report: skill description/user-invoked flags, agent tool
 * contracts (incl. the inherits-all footgun), hook script resolution across the
 * braced/unbraced `$CLAUDE_PLUGIN_ROOT` forms (ok / missing / unresolved),
 * command + MCP detection, and the formatted output. No model, no network.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  scanPlugin,
  formatScanReport,
  expandMarketplace,
  inspectMarketplace,
  unexpectedScript,
} from "./scan.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

function write(dir: string, rel: string, content: string): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function fixture(): string {
  const dir = makeTmpDir("scan");
  write(
    dir,
    "skills/good/SKILL.md",
    "---\nname: good\ndescription: A skill that does good things across many cases\n---\n# good\n",
  );
  write(dir, "skills/nodesc/SKILL.md", "---\nname: nodesc\n---\n# nodesc\n");
  write(
    dir,
    "skills/cmd/SKILL.md",
    "---\nname: cmd\ndescription: A user-invoked command skill for tests here\ndisable-model-invocation: true\n---\n# cmd\n",
  );
  write(
    dir,
    "agents/withtools.md",
    "---\nname: withtools\ntools: Read, Grep\n---\nbody\n",
  );
  write(dir, "agents/notools.md", "---\nname: notools\n---\nbody\n");
  write(dir, "commands/doit.md", "# doit command\n");
  write(dir, "hooks/present.sh", "#!/usr/bin/env bash\n");
  write(
    dir,
    ".claude-plugin/plugin.json",
    JSON.stringify({
      name: "fix",
      hooks: {
        PreToolUse: [
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "bash ${CLAUDE_PLUGIN_ROOT}/hooks/present.sh",
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
                command: "bash $CLAUDE_PLUGIN_ROOT/hooks/absent.sh",
              },
            ],
          },
        ],
        SessionStart: [
          { hooks: [{ type: "command", command: 'bash "$HOME"/weird.sh' }] },
        ],
        Stop: [{ hooks: [{ type: "command", command: "npm test" }] }],
      },
    }),
  );
  write(
    dir,
    ".mcp.json",
    JSON.stringify({
      mcpServers: { demo: { command: "node", args: ["s.js"] } },
    }),
  );
  return dir;
}

test("scanPlugin reports skills with description + user-invoked flags", () => {
  const dir = fixture();
  const r = scanPlugin(dir);
  const byName = Object.fromEntries(r.skills.map((s) => [s.name, s]));
  assert.equal(r.skills.length, 3);
  assert.equal(byName.good.hasDescription, true);
  assert.equal(byName.good.userInvoked, false);
  assert.equal(byName.nodesc.hasDescription, false);
  assert.equal(byName.cmd.userInvoked, true);
  cleanupTmpDir(dir);
});

test("scanPlugin reads a YAML block-scalar description (not just `>`)", () => {
  // Regression: wshobson/agents skills commonly write `description: >` / `>-`
  // folded blocks. The naive regex captured only the indicator, mislabeling a
  // richly-described skill as "no usable description".
  const dir = makeTmpDir("scan-blockscalar");
  write(
    dir,
    "skills/folded/SKILL.md",
    "---\nname: folded\ndescription: >\n  A folded multi-line description that is plenty long enough\n  to be a usable trigger surface for the model.\n---\n# folded\n",
  );
  write(
    dir,
    "skills/chomped/SKILL.md",
    "---\nname: chomped\ndescription: >-\n  Another folded description, chomped variant, also well over\n  the twenty character minimum.\n---\n# chomped\n",
  );
  const r = scanPlugin(dir);
  assert.equal(r.skills.length, 2);
  assert.ok(r.skills.every((s) => s.hasDescription));
  cleanupTmpDir(dir);
});

test("scanPlugin reads a multi-line QUOTED description (value on the next line)", () => {
  // trailofbits/react-pdf shape: `description:` then an indented quoted scalar.
  // Was mislabeled "no description" (can't trigger) — a false positive.
  const dir = makeTmpDir("scan-quoted-desc");
  write(
    dir,
    "skills/q/SKILL.md",
    '---\nname: q\ndescription:\n  "Generates PDF documents using React-PDF with TypeScript.\n  Use when creating reports, invoices, or resumes."\nallowed-tools: Read\n---\n# q\n',
  );
  const q = scanPlugin(dir).skills.find((s) => s.name === "q");
  assert.equal(q?.hasDescription, true);
  cleanupTmpDir(dir);
});

test("scanPlugin resolves a relative hook path against the plugin root, not cwd", () => {
  // ananddtyagi/cc-marketplace shape: `./hooks/x.sh` (the file IS present).
  // existsSync was cwd-relative → reported MISSING (false positive).
  const dir = makeTmpDir("scan-relhook");
  write(dir, "hooks/present.sh", "#!/usr/bin/env bash\n");
  write(
    dir,
    ".claude-plugin/plugin.json",
    JSON.stringify({
      name: "x",
      hooks: {
        PreToolUse: [
          {
            matcher: "Edit",
            hooks: [{ type: "command", command: "bash ./hooks/present.sh" }],
          },
        ],
      },
    }),
  );
  const h = scanPlugin(dir).hooks.find((x) => x.script.includes("present.sh"));
  assert.equal(h?.status, "ok");
  cleanupTmpDir(dir);
});

test("scanPlugin treats an existence-guarded hook command as optional, not missing", () => {
  // gmickel/flow-next shape: `[ ! -f x ] || x` — runs x only if present.
  const dir = makeTmpDir("scan-guardhook");
  write(
    dir,
    ".claude-plugin/plugin.json",
    JSON.stringify({
      name: "x",
      hooks: {
        PreToolUse: [
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "[ ! -f scripts/gen.py ] || scripts/gen.py",
              },
            ],
          },
        ],
      },
    }),
  );
  const r = scanPlugin(dir);
  assert.ok(
    !r.hooks.some((h) => h.status === "missing"),
    "a guarded optional hook must not be flagged missing",
  );
  assert.equal(r.inlineHooks, 1, "counted as a conditional one-liner");
  cleanupTmpDir(dir);
});

test("unexpectedScript: expected is a configurable default (Latin), not hardcoded", () => {
  const ru = "Создавать и обновлять task-folders в репозитории";
  const en = "Create and update task folders in the repo";
  // Default expectation is Latin → Cyrillic text is the mismatch, English isn't.
  assert.equal(unexpectedScript(ru), "Cyrillic");
  assert.equal(unexpectedScript(en), null);
  // A Cyrillic-targeted pack flips it: its Russian descriptions pass, English flags.
  assert.equal(unexpectedScript(ru, "Cyrillic"), null);
  assert.equal(unexpectedScript(en, "Cyrillic"), "Latin");
  // No alphabetic content → nothing to judge.
  assert.equal(unexpectedScript("1234 — !!! ***"), null);
});

test("scanPlugin flags a non-Latin description as a cross-language trigger risk", () => {
  const dir = makeTmpDir("scan-lang");
  // Cyrillic description (fleytman/haretrail shape) — the selector is
  // English-centric, so flag it; an English description must NOT be flagged.
  write(
    dir,
    "skills/ru/SKILL.md",
    "---\nname: ru\ndescription: Создавать и обновлять task-folders в репозитории когда пользователь хочет начать работу\n---\n# ru\n",
  );
  write(
    dir,
    "skills/en/SKILL.md",
    "---\nname: en\ndescription: Create and update task folders in the repo when the user wants to start work\n---\n# en\n",
  );
  // mostly-English with one foreign word → below threshold, not flagged
  write(
    dir,
    "skills/mixed/SKILL.md",
    "---\nname: mixed\ndescription: Generate a résumé summary for the candidate from their work history here\n---\n# mixed\n",
  );
  const byName = Object.fromEntries(
    scanPlugin(dir).skills.map((s) => [s.name, s]),
  );
  assert.equal(byName.ru.descriptionScript, "Cyrillic");
  assert.equal(byName.en.descriptionScript, null);
  assert.equal(byName.mixed.descriptionScript, null);
  const text = formatScanReport(scanPlugin(dir));
  assert.match(
    text,
    /ru \(description in Cyrillic — cross-language trigger risk\)/,
  );
  assert.match(text, /1 skill\(s\) have descriptions in an unexpected script/); // only ru
  cleanupTmpDir(dir);
});

test("scanPlugin reports the instruction file on any repo (spec-managed vs hand-written)", () => {
  // A plain cc repo: just a CLAUDE.md, no plugin surface — scan must still
  // surface the instruction file, not look empty.
  const bare = makeTmpDir("scan-instr-bare");
  write(bare, "CLAUDE.md", "# Project\nRun the build.\n");
  const r1 = scanPlugin(bare);
  assert.deepEqual(r1.instructions, { file: "CLAUDE.md", hasSpec: false });
  assert.match(
    formatScanReport(r1),
    /Instructions: CLAUDE\.md \(hand-written, no spec\)/,
  );
  cleanupTmpDir(bare);

  // A spec-managed instruction file (a sibling CLAUDE.md.spec.ts).
  const managed = makeTmpDir("scan-instr-managed");
  write(managed, "CLAUDE.md", "# Project\n");
  write(managed, "CLAUDE.md.spec.ts", "export default {};\n");
  const r2 = scanPlugin(managed);
  assert.deepEqual(r2.instructions, { file: "CLAUDE.md", hasSpec: true });
  assert.match(
    formatScanReport(r2),
    /Instructions: CLAUDE\.md \(spec-managed\)/,
  );
  cleanupTmpDir(managed);

  // No instruction file → null, no Instructions line.
  const none = makeTmpDir("scan-instr-none");
  write(none, "skills/foo/SKILL.md", "---\nname: foo\ndescription: foo\n---\n");
  const r3 = scanPlugin(none);
  assert.equal(r3.instructions, null);
  assert.doesNotMatch(formatScanReport(r3), /Instructions:/);
  cleanupTmpDir(none);
});

test("scanPlugin flags a never-available agent tool, suppresses unrecognized plugin tools", () => {
  const dir = makeTmpDir("scan-toolcontract");
  // A real-world shape (wshobson agent-teams): a never-available tool (Agent)
  // mixed with plugin-provided tools (TeamCreate, TaskGet) vigiles can't know.
  write(
    dir,
    "agents/lead.md",
    "---\nname: lead\ntools: Read, Bash, Agent, TeamCreate, TaskGet\n---\nbody\n",
  );
  const agent = scanPlugin(dir).agents.find((a) => a.name === "lead");
  assert.equal(agent?.toolIssues.length, 1, "only the never-available tool");
  assert.equal(agent?.toolIssues[0].kind, "never-available");
  assert.equal(agent?.toolIssues[0].tool, "Agent");
  // the report leads with the ✗ + the actionable message
  assert.match(
    formatScanReport(scanPlugin(dir)),
    /never available to a subagent/,
  );
});

test("scanPlugin flags a typo'd agent tool with a did-you-mean", () => {
  const dir = makeTmpDir("scan-tooltypo");
  write(dir, "agents/t.md", "---\nname: t\ntools: Read, Edt\n---\nbody\n");
  const agent = scanPlugin(dir).agents.find((a) => a.name === "t");
  assert.equal(agent?.toolIssues.length, 1);
  assert.match(agent?.toolIssues[0].message ?? "", /Did you mean "Edit"\?/);
});

test("scanPlugin: an inline ARRAY tools form parses (no [Read / Bash] artifacts)", () => {
  const dir = makeTmpDir("scan-toolarray");
  write(
    dir,
    "agents/a.md",
    '---\nname: a\ntools: [Read, "Bash", Edit]\n---\nbody\n',
  );
  const agent = scanPlugin(dir).agents.find((a) => a.name === "a");
  assert.deepEqual(agent?.tools, ["Read", "Bash", "Edit"]);
  assert.deepEqual(agent?.toolIssues, []);
});

test("scanPlugin flags a typo'd hook event, suppresses a framework/custom event", () => {
  const dir = makeTmpDir("scan-hookevent");
  write(
    dir,
    ".claude-plugin/plugin.json",
    JSON.stringify({
      name: "x",
      hooks: {
        // a typo of PreToolUse → flagged; a han-style custom event → suppressed
        PreToolUSe: [
          { matcher: "Edit", hooks: [{ type: "command", command: "echo a" }] },
        ],
        TeammateIdle: [{ hooks: [{ type: "command", command: "echo b" }] }],
      },
    }),
  );
  const r = scanPlugin(dir);
  assert.equal(r.hookEventIssues.length, 1);
  assert.equal(r.hookEventIssues[0].event, "PreToolUSe");
  assert.match(formatScanReport(r), /Hook events/);
  assert.match(formatScanReport(r), /Did you mean "PreToolUse"\?/);
  cleanupTmpDir(dir);
});

test("scanPlugin does NOT flag a hooks ARRAY (non-CC custom format)", () => {
  // ananddtyagi/sugar shape: hooks is a list of {event:"tool-use",…} objects.
  const dir = makeTmpDir("scan-hookarray");
  write(
    dir,
    "hooks/hooks.json",
    JSON.stringify([{ name: "h", event: "tool-use", action: {} }]),
  );
  assert.deepEqual(scanPlugin(dir).hookEventIssues, []);
  cleanupTmpDir(dir);
});

test("scanPlugin reports agent tool contracts incl. inherits-all", () => {
  const dir = fixture();
  const r = scanPlugin(dir);
  const byName = Object.fromEntries(r.agents.map((a) => [a.name, a]));
  assert.deepEqual(byName.withtools.tools, ["Read", "Grep"]);
  assert.equal(byName.notools.tools, null); // no tools: line → inherits all
  cleanupTmpDir(dir);
});

test("scanPlugin does not misclassify a '-agents' skill dir as an agent", () => {
  // Regression: obra/superpowers ships skills/dispatching-parallel-agents/SKILL.md.
  // The old unanchored /agents\/[^/]+\.md$/ matched the `-agents/SKILL.md`
  // substring and reported a phantom agent named "SKILL".
  const dir = makeTmpDir("scan-boundary");
  write(
    dir,
    "skills/dispatching-parallel-agents/SKILL.md",
    "---\nname: dispatching-parallel-agents\ndescription: Dispatch many subagents in parallel for fan-out work\n---\n# x\n",
  );
  write(
    dir,
    "skills/my-commands/SKILL.md",
    "---\nname: my-commands\ndescription: A skill whose directory ends in commands here\n---\n# y\n",
  );
  write(dir, "agents/real.md", "---\nname: real\ntools: Read\n---\nbody\n");
  const r = scanPlugin(dir);
  assert.deepEqual(
    r.agents.map((a) => a.name),
    ["real"],
  );
  assert.equal(r.skills.length, 2);
  assert.equal(r.commands, 0); // the `my-commands` skill dir is not a command
  cleanupTmpDir(dir);
});

test("scanPlugin resolves hook scripts: ok / missing / unresolved", () => {
  const dir = fixture();
  const r = scanPlugin(dir);
  const byBase = (suffix: string) =>
    r.hooks.find((h) => h.script.endsWith(suffix));
  assert.equal(byBase("hooks/present.sh")?.status, "ok"); // ${CLAUDE_PLUGIN_ROOT}
  assert.equal(byBase("hooks/absent.sh")?.status, "missing"); // $CLAUDE_PLUGIN_ROOT, no file
  // "$HOME"/weird.sh keeps an unexpanded var → can't be path-checked
  assert.ok(r.hooks.some((h) => h.status === "unresolved"));
  assert.equal(r.inlineHooks, 1); // `npm test`
  cleanupTmpDir(dir);
});

test("scanPlugin counts commands and detects MCP", () => {
  const dir = fixture();
  const r = scanPlugin(dir);
  assert.equal(r.commands, 1);
  assert.equal(r.mcp, true);
  cleanupTmpDir(dir);
});

test("formatScanReport flags the missing hook + the no-description skill", () => {
  const dir = fixture();
  const text = formatScanReport(scanPlugin(dir));
  assert.ok(text.includes("structural issue")); // absent.sh + nodesc
  assert.ok(/✗ .*hooks\/absent\.sh/.test(text));
  assert.ok(text.includes("inherits all")); // the notools agent footgun
  cleanupTmpDir(dir);
});

test("scanPlugin surfaces a dangling ref from a hook script, but ignores prose mentions", () => {
  const dir = makeTmpDir("scan-dangling");
  // A hook SCRIPT that reads a sibling skill file which doesn't exist — the
  // real partial-vendor / broken-path class (obra/superpowers' hooks/session-start
  // reads skills/using-superpowers/SKILL.md). Executable → a real file op.
  write(
    dir,
    "hooks/session-start.sh",
    "#!/usr/bin/env bash\ncat skills/missing-helper/SKILL.md\n",
  );
  // A SKILL.md that merely MENTIONS a missing path in prose is NOT a real ref
  // (it's an example / template) and must NOT be flagged — the doc-mention trap.
  write(
    dir,
    "skills/docs/SKILL.md",
    "---\nname: docs\ndescription: A skill mentioning skills/not-real/SKILL.md as an example here\n---\nSee skills/not-real/SKILL.md\n",
  );
  const r = scanPlugin(dir);
  assert.deepEqual(r.danglingRefs, ["skills/missing-helper/SKILL.md"]);
  const text = formatScanReport(r);
  assert.ok(text.includes("Broken references"));
  assert.ok(/✗ skills\/missing-helper\/SKILL\.md/.test(text));
  assert.ok(text.includes("structural issue")); // counted in the verdict
  // shown once (as a ✗), not duplicated in the free-text Warnings block
  assert.ok(!text.includes("intra-plugin file(s) that don't exist"));
  cleanupTmpDir(dir);
});

test("expandMarketplace expands a marketplace root into member plugin dirs", () => {
  const dir = makeTmpDir("scan-mp");
  write(
    dir,
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      name: "mp",
      plugins: [
        { name: "a", source: "./plugins/a" },
        { name: "b", source: "./plugins/b" },
        { name: "gone", source: "./plugins/gone" }, // dir doesn't exist → skipped
        { name: "ext", source: { source: "github", repo: "x/y" } }, // not on disk → skipped
      ],
    }),
  );
  write(dir, "plugins/a/skills/sa/SKILL.md", "---\nname: sa\n---\n# sa\n");
  write(dir, "plugins/b/skills/sb/SKILL.md", "---\nname: sb\n---\n# sb\n");
  const members = expandMarketplace(dir);
  assert.ok(members);
  assert.equal(members.length, 2); // gone + ext skipped
  assert.ok(
    members.every((m) => m.endsWith("plugins/a") || m.endsWith("plugins/b")),
  );
  // a non-marketplace dir returns null
  assert.equal(expandMarketplace(join(dir, "plugins/a")), null);
  cleanupTmpDir(dir);
});

test("inspectMarketplace classifies on-disk vs external + dedupes aliased dirs", () => {
  const dir = makeTmpDir("scan-mp-inspect");
  write(
    dir,
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      name: "mp",
      plugins: [
        { name: "a", source: "./plugins/a" },
        // two more NAMES aliasing the same dir — must count once (the han shape)
        { name: "a-alias", source: "./plugins/a" },
        { name: "a-again", source: "./plugins/a" },
        { name: "ext1", source: { source: "url", url: "https://x/y.git" } },
        { name: "ext2", source: { source: "github", repo: "p/q" } },
        { name: "gone", source: "./plugins/gone" }, // string path, absent → external
      ],
    }),
  );
  write(dir, "plugins/a/skills/sa/SKILL.md", "---\nname: sa\n---\n# sa\n");
  const mp = inspectMarketplace(dir);
  assert.ok(mp);
  assert.equal(mp.name, "mp");
  assert.equal(mp.total, 6);
  assert.equal(mp.onDisk.length, 1, "three aliases of plugins/a dedupe to one");
  assert.equal(mp.external, 3, "two url/github + one missing string path");
  // expandMarketplace delegates → also deduped
  assert.deepEqual(expandMarketplace(dir), [...mp.onDisk]);
  assert.equal(inspectMarketplace(join(dir, "plugins/a")), null); // not a marketplace
  cleanupTmpDir(dir);
});

test("inspectMarketplace reports a CURATED marketplace (all external, none on disk)", () => {
  // obra/superpowers-marketplace, anthropics/claude-plugins-community shape.
  const dir = makeTmpDir("scan-mp-curated");
  write(
    dir,
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      name: "curated",
      plugins: [
        { name: "p1", source: { source: "url", url: "https://x/1.git" } },
        { name: "p2", source: { source: "url", url: "https://x/2.git" } },
      ],
    }),
  );
  const mp = inspectMarketplace(dir);
  assert.ok(mp);
  assert.equal(mp.onDisk.length, 0);
  assert.equal(mp.external, 2);
  assert.equal(mp.total, 2);
  assert.deepEqual(expandMarketplace(dir), []); // marketplace, but nothing on disk
  cleanupTmpDir(dir);
});
