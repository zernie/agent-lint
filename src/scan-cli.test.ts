/**
 * End-to-end `vigiles scan` over the repo-shape matrix — driving the REAL built
 * CLI (`node dist/cli.js scan …`) the way a user does, across Claude Code,
 * Codex, mixed, instruction-only, and marketplace repos.
 *
 * Two fixture sources, by design:
 *   - DOGFOOD on real, SHA-pinned OSS plugins (examples/harness/vendor/*) for the
 *     Claude Code surface — the grounded shapes that catch real-world bugs.
 *   - ARTIFICIAL fixtures for Codex / mixed / instruction-only / marketplace,
 *     which we have no vendored example of (built in a tmp dir, torn down after).
 *
 * Deterministic, model-free, offline → the FREE unit tier (like vendor.test.ts),
 * not the cap-gated e2e tier. It exercises the CLI WIRING the library-level
 * scan.test.ts can't: harness auto-detection, the ambiguity warning, the
 * `--harness=` override, the leaderboard branch, `--json`, and the exit code.
 */
import { describe, it, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

// __dirname is src/ when vitest resolves the .ts source → ".." is the repo root.
const CLI = resolve(__dirname, "..", "dist", "cli.js");
const VENDOR = resolve(__dirname, "..", "examples/harness/vendor");

function run(args: string, cwd?: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
      cwd,
    });
    return { stdout, exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? "", exitCode: err.status ?? 1 };
  }
}

/** The vendored plugin DIR whose name starts with `prefix` (SHA-suffix agnostic). */
function vendored(prefix: string): string {
  const match = readdirSync(VENDOR, { withFileTypes: true }).find(
    (d) => d.isDirectory() && d.name.startsWith(prefix),
  );
  assert.ok(match, `no vendored plugin dir starting with "${prefix}"`);
  return join(VENDOR, match.name);
}

// --- Dogfood: real Claude Code OSS plugins -------------------------------------

describe("scan e2e — Claude Code (dogfood real OSS)", () => {
  it("reports a real multi-surface plugin (oh-my-claudecode)", () => {
    const r = run(`scan ${vendored("oh-my-claudecode")}`);
    assert.equal(r.exitCode, 0, "scan is read-only — always exits 0");
    assert.match(r.stdout, /Detected harness: claude-code/);
    assert.match(r.stdout, /Skills \(\d+\)/);
    assert.match(r.stdout, /MCP servers: yes/); // it ships an MCP server
  });

  it("flags an inherits-all agent in a real plugin (wshobson-accessibility)", () => {
    const r = run(`scan ${vendored("wshobson-accessibility")}`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Detected harness: claude-code/);
    // ships an agent with no `tools:` line → the inherits-all footgun
    assert.match(r.stdout, /inherits all — no contract/);
  });
});

// --- Artificial: the cc/codex/mixed/marketplace matrix -------------------------

describe("scan e2e — artificial cc/codex/mixed/marketplace", () => {
  let root: string;
  const mk = (rel: string, content: string): void => {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  };
  const desc = (name: string): string =>
    `A skill ${name} that does varied work across many different cases here`;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "scan-e2e-"));

    // 1. A plain Claude Code repo: only a CLAUDE.md, no plugin surface.
    mk("normal/CLAUDE.md", "# Project\nRun the build before committing.\n");

    // 2. A Codex repo: AGENTS.md + TOML config (with MCP) + a skill.
    mk("codex/AGENTS.md", "# Agent instructions\nUse `npm test`.\n");
    mk("codex/.codex/config.toml", "[mcp_servers]\n");
    mk(
      "codex/skills/foo/SKILL.md",
      `---\nname: foo\ndescription: ${desc("foo")}\n---\n# foo\n`,
    );

    // 2b. A Codex repo wired for `lint` — exercises the layout-driven path end to
    // end: a TOML [hooks] referencing the harness's OWN `${PLUGIN_ROOT}` token (a
    // MISSING script → hook-script-exists fires), an untested skill, and a
    // subagent rule that must report n/a (Codex has no subagents).
    mk("codexlint/AGENTS.md", "# Agent instructions\nUse `npm test`.\n");
    mk(
      "codexlint/.codex/config.toml",
      '[[hooks.PreToolUse]]\ncommand = "${PLUGIN_ROOT}/hooks/missing.sh"\n',
    );
    mk(
      "codexlint/skills/foo/SKILL.md",
      `---\nname: foo\ndescription: ${desc("foo")}\n---\n# foo\n`,
    );
    mk(
      "codexlint/.vigilesrc.json",
      JSON.stringify({
        harness: "codex",
        rules: {
          "hook-script-exists": "warn",
          "untested-skill": "warn",
          "subagent-tool-contract": "warn",
        },
      }),
    );

    // 3. A mixed repo: BOTH CLAUDE.md and AGENTS.md → detection is ambiguous.
    mk("mixed/CLAUDE.md", "# CC\nRun `npm test`.\n");
    mk("mixed/AGENTS.md", "# Codex\nRun `make`.\n");

    // 4. A marketplace: a marketplace.json over two member plugins.
    mk(
      "mp/.claude-plugin/marketplace.json",
      JSON.stringify({
        plugins: [
          { name: "alpha", source: "./plugins/alpha" },
          { name: "beta", source: "./plugins/beta" },
        ],
      }),
    );
    mk(
      "mp/plugins/alpha/skills/x/SKILL.md",
      `---\nname: x\ndescription: ${desc("x")}\n---\n# x\n`,
    );
    mk("mp/plugins/beta/.claude-plugin/plugin.json", '{"name":"beta"}\n');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("CC instruction-only repo: detects claude-code + reports the instruction file", () => {
    const r = run(`scan ${join(root, "normal")}`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Detected harness: claude-code/);
    assert.match(
      r.stdout,
      /Instructions: CLAUDE\.md \(hand-written, no spec\)/,
    );
    assert.match(r.stdout, /no structural issues found/);
  });

  it("Codex repo: detects codex, reports AGENTS.md + skill + TOML MCP", () => {
    const r = run(`scan ${join(root, "codex")}`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Detected harness: codex/);
    assert.match(
      r.stdout,
      /Instructions: AGENTS\.md \(hand-written, no spec\)/,
    );
    assert.match(r.stdout, /Skills \(1\)/);
    assert.match(r.stdout, /MCP servers: yes/); // read from the TOML [mcp_servers]
  });

  it("Codex repo: `lint` runs the layout-driven rules (hook token, untested) and reports subagent n/a", () => {
    // `lint` operates on cwd, so run it INSIDE the fixture. Proves the
    // deterministic rules use the resolved Codex adapter (layout + dialect), not a
    // hard-coded Claude Code default.
    const r = run("lint", join(root, "codexlint"));

    // hook-script-exists resolved the harness's ${PLUGIN_ROOT} token (loaded from
    // TOML [hooks]) and flagged the missing script.
    assert.match(r.stdout, /Hook-script existence check:/);
    assert.match(r.stdout, /missing\.sh.*missing/);

    // untested-skill found the skill under the layout's skill dir.
    assert.match(r.stdout, /Untested surfaces:/);
    assert.match(r.stdout, /foo/);

    // A subagent rule is configured, but Codex has no subagents → n/a, not a
    // false pass and not a crash.
    assert.match(r.stdout, /Subagent tool-contract check:/);
    assert.match(r.stdout, /n\/a — codex has no subagents/);
  });

  it("mixed repo: warns it matches both harnesses, and --harness overrides", () => {
    const auto = run(`scan ${join(root, "mixed")}`);
    assert.equal(auto.exitCode, 0);
    assert.match(auto.stdout, /Detected harness: claude-code/);
    assert.match(auto.stdout, /repo also matches: codex/);

    const forced = run(`scan ${join(root, "mixed")} --harness=codex`);
    assert.match(forced.stdout, /Detected harness: codex/);
    assert.doesNotMatch(forced.stdout, /repo also matches/); // override silences it
  });

  it("marketplace root: expands members into a ranked leaderboard", () => {
    const r = run(`scan ${join(root, "mp")}`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Plugin health leaderboard \(2 scanned\)/);
    assert.match(r.stdout, /alpha/);
    assert.match(r.stdout, /beta/);
  });

  it("curated marketplace (all external members): reports honestly, not 'empty'", () => {
    // obra/superpowers-marketplace, anthropics/claude-plugins-community shape —
    // every member is an external git/url plugin, nothing on disk.
    mk(
      "curated/.claude-plugin/marketplace.json",
      JSON.stringify({
        name: "curated",
        plugins: [
          { name: "p1", source: { source: "url", url: "https://x/1.git" } },
          { name: "p2", source: { source: "url", url: "https://x/2.git" } },
        ],
      }),
    );
    const r = run(`scan ${join(root, "curated")}`);
    assert.equal(r.exitCode, 0);
    assert.match(
      r.stdout,
      /Marketplace "curated": 2 plugin\(s\), all external/,
    );
    assert.doesNotMatch(r.stdout, /no structural issues found/);
    assert.doesNotMatch(r.stdout, /nothing was loaded/);
  });

  it("--json emits a parseable report with the instruction file", () => {
    const r = run(`scan ${join(root, "codex")} --json`);
    assert.equal(r.exitCode, 0);
    const report = JSON.parse(r.stdout) as {
      instructions: { file: string; hasSpec: boolean } | null;
      skills: unknown[];
      mcp: boolean;
    };
    assert.deepEqual(report.instructions, {
      file: "AGENTS.md",
      hasSpec: false,
    });
    assert.equal(report.skills.length, 1);
    assert.equal(report.mcp, true);
  });
});

// --- `vigiles explain` — the deterministic WHY (C4) over the real CLI ----------

describe("explain e2e — deterministic cause + fix", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "explain-e2e-"));
    mkdirSync(join(root, "demo", ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, "demo", ".claude-plugin", "plugin.json"),
      '{"name":"demo"}\n',
    );
    mkdirSync(join(root, "demo", "agents"), { recursive: true });
    // A subagent whose `tools:` names "Reed" — a close typo of the real "Read",
    // so it's silently dropped: the subagent-tool-contract cause of an
    // agent-underperforms symptom, with a did-you-mean fix.
    writeFileSync(
      join(root, "demo", "agents", "rev.md"),
      `---\nname: rev\ndescription: Reviews code changes for correctness and style across the whole repo here\ntools: Reed\n---\n# rev\nReview stuff.\n`,
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("names the deterministic cause, the symptom, and the one-line fix", () => {
    const r = run(`explain ${join(root, "demo")}`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /the subagent loses a declared tool/);
    assert.match(r.stdout, /\[subagent-tool-contract\]/);
    assert.match(r.stdout, /change the tool "Reed" to "Read"/);
  });

  it("a surface name filters to that one underperformer", () => {
    const r = run(`explain ${join(root, "demo")} rev`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Explaining "rev":/);
    assert.match(r.stdout, /change the tool "Reed" to "Read"/);
  });

  it("--json emits the structured explanation array", () => {
    const r = run(`explain ${join(root, "demo")} --json`);
    assert.equal(r.exitCode, 0);
    const exps = JSON.parse(r.stdout) as {
      surface: string;
      symptom: string;
      detector: string;
      fix: string;
      confidence: string;
    }[];
    assert.equal(exps.length, 1);
    assert.equal(exps[0].symptom, "agent-underperforms");
    assert.equal(exps[0].detector, "subagent-tool-contract");
    assert.equal(exps[0].confidence, "likely");
    assert.match(exps[0].fix, /Read/);
  });

  it("a clean surface reports no deterministic cause (behavioral fallthrough)", () => {
    const r = run(`explain ${join(root, "demo")} absent`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /No deterministic cause found/);
  });
});

describe("scan --fix-plan e2e — health score + ranked free fixes (A2)", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "fix-plan-e2e-"));
    mkdirSync(join(root, "demo", ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, "demo", ".claude-plugin", "plugin.json"),
      '{"name":"demo"}\n',
    );
    mkdirSync(join(root, "demo", "agents"), { recursive: true });
    // Same typo'd-tool subagent as the explain fixture: a deterministic FIX.
    writeFileSync(
      join(root, "demo", "agents", "rev.md"),
      `---\nname: rev\ndescription: Reviews code changes for correctness and style across the whole repo here\ntools: Reed\n---\n# rev\nReview stuff.\n`,
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("prints the health score and a ranked FIX with the hand-off to measurement", () => {
    const r = run(`scan ${join(root, "demo")} --fix-plan`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Harness health: \d+\/100/);
    assert.match(r.stdout, /\[FIX\] rev/);
    assert.match(r.stdout, /\[subagent-tool-contract\]/);
    // The whole point: hand off the behavioral question to the measured layer.
    assert.match(r.stdout, /--trigger/);
  });

  it("--fix-plan --json emits the structured plan (score, grade, recommendations)", () => {
    const r = run(`scan ${join(root, "demo")} --fix-plan --json`);
    assert.equal(r.exitCode, 0);
    const plan = JSON.parse(r.stdout) as {
      score: number;
      grade: string;
      empty: boolean;
      recommendations: { surface: string; action: string; detector: string }[];
    };
    assert.equal(plan.empty, false);
    assert.equal(plan.recommendations.length, 1);
    assert.equal(plan.recommendations[0].action, "fix");
    assert.equal(plan.recommendations[0].surface, "rev");
    assert.equal(plan.recommendations[0].detector, "subagent-tool-contract");
  });
});

describe("scaffold-test e2e — test-gen for untested surfaces (B1)", () => {
  let root: string;
  let plugin: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "scaffold-cli-"));
    plugin = join(root, "demo");
    mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(plugin, ".claude-plugin", "plugin.json"),
      '{"name":"demo"}\n',
    );
    mkdirSync(join(plugin, "skills", "greet"), { recursive: true });
    writeFileSync(
      join(plugin, "skills", "greet", "SKILL.md"),
      "---\nname: greet\ndescription: Greets the user warmly\n---\nGreet them.\n",
    );
    mkdirSync(join(plugin, "agents"), { recursive: true });
    writeFileSync(
      join(plugin, "agents", "reviewer.md"),
      "---\nname: reviewer\ndescription: Reviews a diff\ntools: Read, Grep\n---\nReview.\n",
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("dry-run lists each untested surface with its kind + tier", () => {
    const r = run(`scaffold-test ${plugin}`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /skills\/greet\/greet\.eval\.mjs\s+\[skill → eval/);
    assert.match(
      r.stdout,
      /agents\/reviewer\.harness\.mjs\s+\[agent → harness/,
    );
    // dry-run prints content, not files: nothing written yet.
    assert.equal(
      existsSync(join(plugin, "skills", "greet", "greet.eval.mjs")),
      false,
    );
  });

  it("--write creates the files with the right public imports + namespaced id", () => {
    const r = run(`scaffold-test ${plugin} --write`);
    assert.equal(r.exitCode, 0);
    const evalFile = join(plugin, "skills", "greet", "greet.eval.mjs");
    assert.ok(existsSync(evalFile));
    const content = readFileSync(evalFile, "utf-8");
    assert.match(content, /from "vigiles\/testing"/);
    assert.match(content, /"demo:greet"/); // the manifest name, not the dir basename
    assert.match(content, /measureTriggerRate/);
  });

  it("--write a second time skips the now-covered surfaces (no clobber)", () => {
    const r = run(`scaffold-test ${plugin} --write`);
    assert.equal(r.exitCode, 0);
    // The skill+agent now have colocated tests → no longer untested → nothing to do.
    assert.match(r.stdout, /Nothing to scaffold|skipped/);
  });

  it("--json emits the agent-consumable { path, content }[]", () => {
    const fresh = join(root, "fresh");
    mkdirSync(join(fresh, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(fresh, ".claude-plugin", "plugin.json"),
      '{"name":"fresh"}\n',
    );
    mkdirSync(join(fresh, "skills", "hi"), { recursive: true });
    writeFileSync(
      join(fresh, "skills", "hi", "SKILL.md"),
      "---\nname: hi\ndescription: Says hi\n---\nHi.\n",
    );
    const r = run(`scaffold-test ${fresh} --json`);
    assert.equal(r.exitCode, 0);
    const scaffolds = JSON.parse(r.stdout) as {
      path: string;
      kind: string;
      tier: string;
      content: string;
    }[];
    assert.equal(scaffolds.length, 1);
    assert.equal(scaffolds[0].path, "skills/hi/hi.eval.mjs");
    assert.equal(scaffolds[0].tier, "eval");
    assert.match(scaffolds[0].content, /"fresh:hi"/);
  });
});

// --- generate-harness: the whole-harness typed registry ------------------------
//
// Drives the REAL built CLI to emit `harness.gen.ts` over a dir of real specs.
// The fixture lives UNDER the repo root and the CLI runs with cwd = repo root,
// so both `vigiles/spec` (the spec imports + the gen file's KnownAgentName) and
// the gen file's sibling `*.spec.ts` imports resolve. Covers the CLI wiring the
// library-level generate-harness.test.ts can't: spec loading, the duplicate
// non-zero exit, and the emitted file.
describe("generate-harness CLI", () => {
  const REPO = resolve(__dirname, "..");
  let dir = "";

  const PLANNER = `import { agent, result } from "vigiles/spec";
export default agent({
  name: "planner",
  description: "Break the request into an ordered plan. Dispatch first.",
  tools: ["Read", "Grep", "Glob"],
  output: result({ steps: "string[]" }, { reason: "string" }),
});
`;
  const IMPLEMENTER = `import { agent } from "vigiles/spec";
export default agent({
  name: "implementer",
  description: "Implement the plan and prove the build passes.",
  tools: ["Read", "Edit", "Write", "Bash"],
});
`;

  beforeAll(() => {
    dir = mkdtempSync(join(REPO, ".tmp-genh-cli-"));
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("emits harness.gen.ts over a dir of specs (exit 0)", () => {
    writeFileSync(join(dir, "planner.spec.ts"), PLANNER);
    writeFileSync(join(dir, "implementer.spec.ts"), IMPLEMENTER);
    writeFileSync(
      join(dir, "ship.spec.ts"),
      `import { railway, delegate } from "vigiles/spec";
export default railway({ name: "ship", steps: [delegate("planner"), delegate("implementer")] });
`,
    );
    const out = join(dir, "harness.gen.ts");
    const r = run(`generate-harness ${dir} ${out}`, REPO);
    assert.equal(r.exitCode, 0, r.stdout);
    assert.ok(existsSync(out));
    const gen = readFileSync(out, "utf-8");
    assert.match(gen, /export const registry =/);
    assert.match(gen, /export type AgentName =/);
    assert.match(gen, /_edge_0: KnownAgentName<"planner", AgentName, "ship">/);
    assert.match(gen, /export const harnessCapabilities =/);
    // --check on the just-written file is a no-op (up to date)
    const chk = run(`generate-harness ${dir} ${out} --check`, REPO);
    assert.equal(chk.exitCode, 0);
    assert.match(chk.stdout, /up to date/);
  });

  it("exits non-zero on a duplicate agent name", () => {
    const dupDir = mkdtempSync(join(REPO, ".tmp-genh-dup-"));
    try {
      writeFileSync(join(dupDir, "a.spec.ts"), PLANNER);
      writeFileSync(
        join(dupDir, "b.spec.ts"),
        PLANNER.replace("Break the request", "A second planner colliding"),
      );
      const r = run(
        `generate-harness ${dupDir} ${join(dupDir, "harness.gen.ts")}`,
        REPO,
      );
      assert.notEqual(r.exitCode, 0);
      assert.match(r.stdout, /duplicate agent name "planner"/);
      assert.ok(!existsSync(join(dupDir, "harness.gen.ts")));
    } finally {
      rmSync(dupDir, { recursive: true, force: true });
    }
  });
});

// --- capability-diff e2e (the moat #2 PR-comment surface) ----------------------

describe("capability-diff e2e", () => {
  // before: a read-only worker; after: the same worker GAINS Bash (blast radius up).
  function versions(): { before: string; after: string; root: string } {
    const root = mkdtempSync(join(tmpdir(), "vigiles-capdiff-"));
    const mk = (sub: string, tools: string) => {
      const dir = join(root, sub);
      mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
      writeFileSync(
        join(dir, ".claude-plugin", "plugin.json"),
        JSON.stringify({ name: "demo" }),
      );
      mkdirSync(join(dir, "agents"), { recursive: true });
      writeFileSync(
        join(dir, "agents", "worker.md"),
        `---\nname: worker\ndescription: A worker agent\ntools: ${tools}\n---\nbody\n`,
      );
      return dir;
    };
    return {
      before: mk("before", "Read, Grep"),
      after: mk("after", "Read, Grep, Bash"),
      root,
    };
  }

  it("flags a widened blast radius and exits 0 by default (informational)", () => {
    const { before, after, root } = versions();
    try {
      const r = run(`capability-diff ${before} ${after}`);
      assert.equal(r.exitCode, 0, "widening is informational by default");
      assert.match(r.stdout, /WIDENED/);
      assert.match(r.stdout, /side-effecting: Bash/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 1 on a widening with --fail-on-widen (the opt-in CI gate)", () => {
    const { before, after, root } = versions();
    try {
      const r = run(`capability-diff ${before} ${after} --fail-on-widen`);
      assert.equal(r.exitCode, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports no change when the surface is identical", () => {
    const { after, root } = versions();
    try {
      const r = run(`capability-diff ${after} ${after} --fail-on-widen`);
      assert.equal(r.exitCode, 0, "no widening → no gate trip");
      assert.match(r.stdout, /unchanged/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
