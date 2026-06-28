/**
 * `vigiles audit` test suite. Builds a tiny fake plugin in a tmp dir and asserts
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
  verifyLiveMcpTools,
  formatMcpContractReport,
  isManagedHookCommand,
  preferCompiledHooksMessage,
} from "./scan.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";
import { claudeCodeLayout } from "./adapters/claude-code/layout.js";
import { claudeCodeDialect } from "./adapters/claude-code/dialect.js";

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

test("subagent classification is layout-driven (ready for new harnesses)", () => {
  // A harness whose subagents live somewhere other than `agents/` — e.g.
  // OpenCode's `.opencode/agent`. Here: a flat `subagents/` dir, declared via
  // the layout. The classifier must find it there AND a default Claude Code scan
  // (agentDir "agents") must NOT — proving the dir is read from the layout, not
  // hard-coded.
  const dir = makeTmpDir("scan-layout-agentdir");
  write(
    dir,
    "subagents/reviewer.md",
    "---\nname: reviewer\ndescription: Reviews code for issues carefully\ntools: Reat\n---\nReview.\n",
  );

  const customLayout = {
    ...claudeCodeLayout,
    agentDir: "subagents",
    surfaceDirs: ["subagents"],
    materializeRoot: "",
  };
  const r = scanPlugin(dir, customLayout, claudeCodeDialect);
  const reviewer = r.agents.find((a) => a.name === "reviewer");
  assert.ok(reviewer, "subagent under the layout's agentDir is classified");
  assert.ok(
    reviewer.toolIssues.length > 0,
    "the typo'd tool (Reat→Read) is flagged via the same detector",
  );

  // Default Claude Code layout (agentDir "agents") must not classify it.
  assert.equal(scanPlugin(dir).agents.length, 0);
  cleanupTmpDir(dir);
});

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

test("isManagedHookCommand: only a hook-runtime invocation is vigiles-managed", () => {
  assert.equal(
    isManagedHookCommand(
      "node dist/cli.js hook-runtime run-program .vigiles/hooks/guard.mjs",
    ),
    true,
  );
  assert.equal(isManagedHookCommand("npx vigiles hook-runtime refs"), true);
  assert.equal(isManagedHookCommand("bash ./hooks/guard.sh"), false);
  assert.equal(isManagedHookCommand("git status"), false);
});

test("scanPlugin counts hand-written hooks for prefer-compiled-hooks (managed ones excluded)", () => {
  const dir = makeTmpDir("scan-prefer-compiled");
  write(dir, "hooks/guard.sh", "#!/usr/bin/env bash\n");
  write(
    dir,
    ".claude/settings.json",
    JSON.stringify({
      hooks: {
        // two hand-written (a script + an inline one-liner)…
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: "bash ${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh",
              },
            ],
          },
        ],
        Stop: [{ hooks: [{ type: "command", command: "npm test" }] }],
        // …and one compiled, vigiles-managed hook (must NOT count)
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: "command",
                command:
                  "node dist/cli.js hook-runtime run-program .vigiles/hooks/x.mjs",
              },
            ],
          },
        ],
      },
    }),
  );
  const r = scanPlugin(dir);
  assert.equal(
    r.manualHookCount,
    2,
    "two hand-written, the compiled one excluded",
  );
  // The single nudge surfaces in the report, linking the guide.
  const out = formatScanReport(r);
  assert.match(out, /hand-written hook/);
  assert.match(out, /docs\/compiled-hooks\.md/);
  assert.match(preferCompiledHooksMessage(2), /docs\/compiled-hooks\.md/);
  cleanupTmpDir(dir);
});

test("scanPlugin reports manualHookCount 0 when there are no hand-written hooks", () => {
  const dir = makeTmpDir("scan-no-manual-hooks");
  write(dir, "CLAUDE.md", "# x\n");
  const r = scanPlugin(dir);
  assert.equal(r.manualHookCount, 0);
  assert.doesNotMatch(formatScanReport(r), /hand-written hook/);
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

test("subagent-frontmatter flags a prose-only AGENT, but NOT a frontmatter-less skill", () => {
  const dir = makeTmpDir("scan-fm");
  // A skill with NO frontmatter still loads in CC (name←dir, description←first
  // body paragraph), so it must NOT be flagged — that was a false positive.
  write(
    dir,
    "skills/noname/SKILL.md",
    "# Crisis Advisor\n\nprose, no frontmatter\n",
  );
  // A subagent REQUIRES name+description (no fallback) → a prose-only one won't
  // register. This is the real bug class.
  write(
    dir,
    "agents/proseonly.md",
    "You are an expert. No frontmatter here.\n",
  );
  const r = scanPlugin(dir);
  assert.ok(
    !r.frontmatterIssues.some((i) => i.path.includes("noname")),
    "a frontmatter-less skill is NOT flagged (dir/body fallbacks)",
  );
  assert.ok(
    r.frontmatterIssues.some(
      (i) =>
        i.path.includes("proseonly") &&
        i.kind === "agent" &&
        i.missing.includes("name") &&
        i.missing.includes("description"),
    ),
    "a prose-only agent is missing both required fields",
  );
  assert.match(formatScanReport(r), /Frontmatter/);
  cleanupTmpDir(dir);
});

test("scanPlugin recommends explicit skill frontmatter (skillMetaIssues), but it's not a structural defect", () => {
  const dir = makeTmpDir("scan-skillmeta");
  // Has a description (so it loads + has a trigger surface) but NO explicit name
  // → recommendation only, NOT a structural defect.
  write(
    dir,
    "skills/foo/SKILL.md",
    "---\ndescription: A foo skill with a real explicit description for testing here\n---\n# Foo\n",
  );
  // Explicit name+description → no recommendation.
  write(
    dir,
    "skills/bar/SKILL.md",
    "---\nname: bar\ndescription: A bar skill with a proper explicit description here\n---\n# bar\n",
  );
  const r = scanPlugin(dir);
  assert.equal(r.skillMetaIssues.length, 1);
  assert.ok(r.skillMetaIssues[0].path.includes("foo"));
  assert.deepEqual(r.skillMetaIssues[0].missing, ["name"]);
  // It's a recommendation, NOT a structural issue — must not flip the verdict.
  assert.match(formatScanReport(r), /no structural issues found/);
  assert.match(formatScanReport(r), /lack an explicit frontmatter/);
  cleanupTmpDir(dir);
});

test("scanPlugin flags an MCP server that can't start (no command/url)", () => {
  const dir = makeTmpDir("scan-mcp");
  write(
    dir,
    ".mcp.json",
    JSON.stringify({
      mcpServers: {
        ok: { command: "node", args: ["s.js"] },
        remote: { url: "https://x/sse" },
        broken: { args: ["x"] }, // neither command nor url
      },
    }),
  );
  const r = scanPlugin(dir);
  assert.equal(r.mcpIssues.length, 1);
  assert.equal(r.mcpIssues[0].server, "broken");
  assert.match(formatScanReport(r), /MCP config/);
  cleanupTmpDir(dir);
});

test("scanPlugin flags an mcp__server__tool whose server the plugin doesn't declare", () => {
  const dir = makeTmpDir("scan-mcptool");
  write(
    dir,
    ".mcp.json",
    JSON.stringify({ mcpServers: { github: { command: "gh-mcp" } } }),
  );
  write(
    dir,
    "agents/a.md",
    "---\nname: a\ntools: Read, mcp__github__search, mcp__linear__create, mcp__ide__getDiagnostics\n---\nbody\n",
  );
  const agent = scanPlugin(dir).agents.find((x) => x.name === "a");
  // github = declared (ok), ide = built-in (allowlisted), linear = undeclared (flagged)
  assert.equal(agent?.mcpToolIssues.length, 1);
  assert.equal(agent?.mcpToolIssues[0].server, "linear");
  assert.match(formatScanReport(scanPlugin(dir)), /can't resolve/);
  cleanupTmpDir(dir);
});

test("scanPlugin does NOT flag mcp tools when the plugin declares no servers", () => {
  // The high-precision gate: with no .mcp.json, the agent reaches global/project
  // servers (the ananddtyagi mcp__ide__* shape) — flagging would cry wolf.
  const dir = makeTmpDir("scan-mcptool-nogate");
  write(
    dir,
    "agents/a.md",
    "---\nname: a\ntools: Task, mcp__ide__getDiagnostics, mcp__anything__x\n---\nbody\n",
  );
  const agent = scanPlugin(dir).agents.find((x) => x.name === "a");
  assert.deepEqual(agent?.mcpToolIssues, []);
  cleanupTmpDir(dir);
});

test("scanPlugin reports malformed-YAML frontmatter as an informational note, not a defect", () => {
  const dir = makeTmpDir("scan-malformed");
  // Unclosed flow array → invalid YAML; salvage still recovers a long description
  // (so the ONLY finding is the malformed note, not a no-description defect).
  write(
    dir,
    "skills/bad/SKILL.md",
    "---\nname: bad\ndescription: a perfectly long salvageable description here\nallowed-tools: [a, b, c\n---\n# bad\n",
  );
  // Valid frontmatter → not flagged.
  write(
    dir,
    "skills/good/SKILL.md",
    "---\nname: good\ndescription: a perfectly valid description here\n---\n# good\n",
  );
  const r = scanPlugin(dir);
  assert.equal(r.malformedFrontmatter.length, 1);
  assert.match(r.malformedFrontmatter[0].path, /bad\/SKILL\.md$/);
  // It's a soft note, NOT counted in the structural verdict.
  assert.match(formatScanReport(r), /isn't valid YAML/);
  assert.doesNotMatch(formatScanReport(r), /1 structural issue/);
  cleanupTmpDir(dir);
});

test("scanPlugin flags near-duplicate model-invocable skill descriptions, skips user-invoked", () => {
  const dir = makeTmpDir("scan-overlap");
  const dup =
    "Use this skill to review code for security issues and suggest concrete fixes before merging the change";
  write(
    dir,
    "skills/a/SKILL.md",
    `---\nname: a\ndescription: ${dup}\n---\n# a\n`,
  );
  write(
    dir,
    "skills/b/SKILL.md",
    `---\nname: b\ndescription: ${dup}\n---\n# b\n`,
  );
  // A user-invoked near-dup must NOT collide (picked by explicit command).
  write(
    dir,
    "skills/c/SKILL.md",
    `---\nname: c\ndescription: ${dup}\ndisable-model-invocation: true\n---\n# c\n`,
  );
  const r = scanPlugin(dir);
  assert.equal(r.descriptionOverlaps.length, 1);
  assert.deepEqual(
    [r.descriptionOverlaps[0].a, r.descriptionOverlaps[0].b].sort(),
    ["a", "b"],
  );
  assert.match(formatScanReport(r), /near-identical/);
  cleanupTmpDir(dir);
});

test("scanPlugin flags an agent model/color typo, not a valid value or full model id", () => {
  const dir = makeTmpDir("scan-modelcolor");
  write(
    dir,
    "agents/typo.md",
    "---\nname: t\ndescription: d\nmodel: sonet\ncolor: yelow\n---\nbody\n",
  );
  write(
    dir,
    "agents/ok.md",
    "---\nname: o\ndescription: d\nmodel: claude-sonnet-4-5\ncolor: cyan\n---\nbody\n",
  );
  const r = scanPlugin(dir);
  const fields = r.frontmatterValueIssues.map(
    (i) => `${i.field}:${i.suggestion}`,
  );
  // typo.md: sonet→sonnet, yelow→yellow. ok.md: full id (skipped) + valid color.
  assert.deepEqual(fields.sort(), ["color:yellow", "model:sonnet"]);
  assert.match(formatScanReport(r), /silently falls back/);
  cleanupTmpDir(dir);
});

test("scanPlugin flags a disallowedTools typo (blocks nothing), not a valid/unknown entry", () => {
  const dir = makeTmpDir("scan-disallowed");
  write(
    dir,
    "agents/a.md",
    "---\nname: a\ntools: Read\ndisallowedTools: Bsh, Bash, Agent, mcp__x__y\n---\nbody\n",
  );
  const agent = scanPlugin(dir).agents.find((x) => x.name === "a");
  // Bsh = typo of Bash (flagged); Bash = legitimately blocked; Agent =
  // never-available (harmless to block); mcp__x__y = a real plugin tool to block.
  assert.equal(agent?.disallowedToolIssues.length, 1);
  assert.equal(agent?.disallowedToolIssues[0].tool, "Bsh");
  assert.match(agent?.disallowedToolIssues[0].message ?? "", /blocks nothing/);
  assert.match(formatScanReport(scanPlugin(dir)), /Did you mean "Bash"\?/);
  cleanupTmpDir(dir);
});

test("scanPlugin flags a mcp_tool hook targeting an undeclared server + an incomplete one", () => {
  const dir = makeTmpDir("scan-mcphook");
  write(
    dir,
    ".mcp.json",
    JSON.stringify({ mcpServers: { github: { command: "gh-mcp" } } }),
  );
  write(
    dir,
    ".claude-plugin/plugin.json",
    JSON.stringify({
      name: "x",
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              { type: "mcp_tool", server: "github", tool: "search" }, // ok
              { type: "mcp_tool", server: "linear", tool: "create" }, // undeclared
              { type: "mcp_tool", server: "github" }, // incomplete (no tool)
              { type: "command", command: "echo hi" }, // ignored
            ],
          },
        ],
      },
    }),
  );
  const r = scanPlugin(dir);
  assert.equal(r.mcpHookIssues.length, 2);
  assert.ok(
    r.mcpHookIssues.some(
      (i) => i.kind === "undeclared-server" && i.server === "linear",
    ),
  );
  assert.ok(r.mcpHookIssues.some((i) => i.kind === "incomplete"));
  assert.match(formatScanReport(r), /MCP hook targets/);
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

test("scanPlugin does not treat a skill-internal agents/ dir as subagents", () => {
  // Regression: Anthropic's official skill-creator ships skill-internal worker
  // docs at skills/skill-creator/agents/{analyzer,comparator,grader}.md with NO
  // frontmatter. Those are NOT dispatchable Claude Code subagents (CC loads
  // subagents only from the plugin's TOP-LEVEL agents/ — recursively WITHIN it,
  // never nested under a skill). The old classifier matched `agents/` anywhere in
  // the path, so it flagged them as subagents missing name/description + with no
  // tool contract → mis-graded a first-party plugin F. They must be ignored.
  const dir = makeTmpDir("scan-nested-agents");
  write(
    dir,
    "skills/skill-creator/SKILL.md",
    "---\nname: skill-creator\ndescription: Create new skills end to end\n---\n# x\n",
  );
  // No frontmatter — would be flagged if misclassified as a subagent.
  write(dir, "skills/skill-creator/agents/analyzer.md", "# Analyzer\nprose\n");
  write(
    dir,
    "skills/skill-creator/agents/comparator.md",
    "# Comparator\nprose\n",
  );
  write(dir, "skills/skill-creator/agents/grader.md", "# Grader\nprose\n");
  // A genuine TOP-LEVEL subagent must still be discovered AND checked.
  write(
    dir,
    "agents/reviewer.md",
    "---\nname: reviewer\ndescription: Review a diff for correctness\ntools: Read\n---\nbody\n",
  );
  const r = scanPlugin(dir);
  // Only the real top-level subagent registers; the nested files are ignored.
  assert.deepEqual(
    r.agents.map((a) => a.name),
    ["reviewer"],
  );
  // No frontmatter penalty: the real agent is complete and the nested
  // skill-internal docs (no frontmatter) are not subagents at all.
  assert.equal(r.frontmatterIssues.length, 0);
  cleanupTmpDir(dir);
});

test("scanPlugin still flags a real top-level subagent missing frontmatter", () => {
  // Guard the other direction: the nested-agents exclusion must NOT silence a
  // genuine top-level agents/ file that really is missing name/description.
  const dir = makeTmpDir("scan-real-agent-missing-fm");
  write(dir, "agents/broken.md", "# Broken\nno frontmatter at all\n");
  const r = scanPlugin(dir);
  assert.deepEqual(
    r.agents.map((a) => a.name),
    ["broken"],
  );
  assert.ok(
    r.frontmatterIssues.some((i) => i.path.endsWith("agents/broken.md")),
  );
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

// ---------------------------------------------------------------------------
// Effect-surface column tests (deterministic, no model)
// ---------------------------------------------------------------------------

test("effect surface: agent with only read-only tools is pure", () => {
  const dir = makeTmpDir("scan-effect-pure");
  write(
    dir,
    "agents/reader.md",
    "---\nname: reader\ndescription: Reads files\ntools: Read, Grep, Glob\n---\nbody\n",
  );
  const agent = scanPlugin(dir).agents.find((a) => a.name === "reader");
  assert.ok(agent, "agent found");
  assert.equal(agent.purity, "pure");
  assert.deepEqual(agent.effectBuckets.sideEffecting, []);
  assert.deepEqual(agent.effectBuckets.unknown, []);
  assert.ok(agent.effectBuckets.readOnly.length > 0, "has read-only tools");
  cleanupTmpDir(dir);
});

test("effect surface: agent with side-effecting tools (no Bash) is bounded", () => {
  const dir = makeTmpDir("scan-effect-bounded");
  write(
    dir,
    "agents/writer.md",
    "---\nname: writer\ndescription: Writes files\ntools: Read, Write, Edit\n---\nbody\n",
  );
  const agent = scanPlugin(dir).agents.find((a) => a.name === "writer");
  assert.ok(agent, "agent found");
  assert.equal(agent.purity, "bounded");
  assert.ok(
    agent.effectBuckets.sideEffecting.length > 0,
    "has side-effecting tools",
  );
  assert.deepEqual(agent.effectBuckets.unknown, []);
  cleanupTmpDir(dir);
});

test("effect surface: agent with Bash is unrestricted", () => {
  const dir = makeTmpDir("scan-effect-bash");
  write(
    dir,
    "agents/runner.md",
    "---\nname: runner\ndescription: Runs commands\ntools: Read, Bash\n---\nbody\n",
  );
  const agent = scanPlugin(dir).agents.find((a) => a.name === "runner");
  assert.ok(agent, "agent found");
  assert.equal(agent.purity, "unrestricted");
  assert.ok(
    agent.effectBuckets.sideEffecting.includes("Bash"),
    "Bash in side-effecting bucket",
  );
  cleanupTmpDir(dir);
});

test("effect surface: agent with no tools line (inherits-all) is unrestricted", () => {
  const dir = makeTmpDir("scan-effect-inheritsall");
  // An agent with no `tools:` line inherits all tools including side-effecting ones.
  write(
    dir,
    "agents/wildcard.md",
    "---\nname: wildcard\ndescription: Does anything\n---\nbody\n",
  );
  const agent = scanPlugin(dir).agents.find((a) => a.name === "wildcard");
  assert.ok(agent, "agent found");
  assert.equal(agent.tools, null, "no tools: line → inherits all");
  assert.equal(agent.purity, "unrestricted");
  cleanupTmpDir(dir);
});

test("effect surface: harness-level puritySummary aggregates correctly", () => {
  const dir = makeTmpDir("scan-effect-summary");
  // pure: only read-only tools
  write(
    dir,
    "agents/reader.md",
    "---\nname: reader\ndescription: Reads\ntools: Read, Grep\n---\nbody\n",
  );
  // bounded: side-effecting, no Bash, no unknown
  write(
    dir,
    "agents/writer.md",
    "---\nname: writer\ndescription: Writes\ntools: Read, Write\n---\nbody\n",
  );
  // unrestricted: Bash
  write(
    dir,
    "agents/runner.md",
    "---\nname: runner\ndescription: Runs\ntools: Bash\n---\nbody\n",
  );
  // unrestricted: inherits-all (no tools: line)
  write(
    dir,
    "agents/wild.md",
    "---\nname: wild\ndescription: Wild\n---\nbody\n",
  );
  const r = scanPlugin(dir);
  assert.equal(r.puritySummary.pure, 1);
  assert.equal(r.puritySummary.bounded, 1);
  assert.equal(r.puritySummary.unrestricted, 2);
  cleanupTmpDir(dir);
});

test("effect surface: formatScanReport includes purity tags per agent and the summary line", () => {
  const dir = makeTmpDir("scan-effect-format");
  write(
    dir,
    "agents/reader.md",
    "---\nname: reader\ndescription: Reads files for analysis\ntools: Read, Grep\n---\nbody\n",
  );
  write(
    dir,
    "agents/writer.md",
    "---\nname: writer\ndescription: Writes output files here\ntools: Read, Write\n---\nbody\n",
  );
  write(
    dir,
    "agents/runner.md",
    "---\nname: runner\ndescription: Runs shell commands here\ntools: Bash\n---\nbody\n",
  );
  const text = formatScanReport(scanPlugin(dir));
  // Each agent line includes the purity tag in brackets.
  assert.match(text, /reader.*\[pure\]/);
  assert.match(text, /writer.*\[bounded\]/);
  assert.match(text, /runner.*\[unrestricted\]/);
  // Harness-level summary line is present.
  assert.match(text, /Effect surface: 1 pure · 1 bounded · 1 unrestricted/);
  cleanupTmpDir(dir);
});

test("effect surface: puritySummary is in the JSON shape (ScanReport)", () => {
  const dir = makeTmpDir("scan-effect-json");
  write(
    dir,
    "agents/a.md",
    "---\nname: a\ndescription: Does stuff\ntools: Read\n---\nbody\n",
  );
  const r = scanPlugin(dir);
  // The puritySummary field is present on the report object (JSON shape).
  assert.ok("puritySummary" in r);
  assert.equal(typeof r.puritySummary.pure, "number");
  assert.equal(typeof r.puritySummary.bounded, "number");
  assert.equal(typeof r.puritySummary.unrestricted, "number");
  // effectBuckets is on each agent.
  assert.ok("effectBuckets" in r.agents[0]);
  assert.ok("purity" in r.agents[0]);
  cleanupTmpDir(dir);
});

// __dirname is dist/ at runtime; the fixture server lives at the repo root.
const FIXTURE = join(__dirname, "../examples/harness/fixture-mcp-server.mjs");

test("verifyLiveMcpTools: flags a tool absent from the live server (with a did-you-mean)", async () => {
  const dir = makeTmpDir("scan-verify-mcp");
  // Declare the fixture server (exposes echo, add) and an agent that references a
  // real tool (echo) plus a typo (ekho) — the static check passes the server, only
  // a live tools/list catches the missing tool.
  write(
    dir,
    ".mcp.json",
    JSON.stringify({
      mcpServers: { fixture: { command: process.execPath, args: [FIXTURE] } },
    }),
  );
  write(
    dir,
    "agents/probe.md",
    "---\nname: probe\ndescription: Probes the server\ntools: Read, mcp__fixture__echo, mcp__fixture__ekho\n---\nbody\n",
  );
  const report = scanPlugin(dir);
  const errs = await verifyLiveMcpTools(
    report,
    claudeCodeLayout,
    claudeCodeDialect,
  );
  assert.equal(errs.length, 1);
  assert.equal(errs[0].reason, "tool-missing");
  assert.equal(errs[0].toolName, "ekho");
  assert.ok(errs[0].suggestions.includes("echo"));
  // The human-readable report names the issue.
  assert.match(formatMcpContractReport(errs), /1 issue/);
  cleanupTmpDir(dir);
});

test("verifyLiveMcpTools: no declared servers → nothing started, no errors", async () => {
  const dir = makeTmpDir("scan-verify-mcp-none");
  // An agent references an undeclared server — the live check has no config to
  // start it, so it's the static verifyMcpToolServers' job, not this tier's.
  write(
    dir,
    "agents/probe.md",
    "---\nname: probe\ndescription: Probes a ghost\ntools: mcp__ghost__whatever\n---\nbody\n",
  );
  const report = scanPlugin(dir);
  const errs = await verifyLiveMcpTools(
    report,
    claudeCodeLayout,
    claudeCodeDialect,
  );
  assert.deepEqual(errs, []);
  assert.match(formatMcpContractReport(errs), /resolves/);
  cleanupTmpDir(dir);
});
