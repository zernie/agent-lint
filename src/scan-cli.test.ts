/**
 * End-to-end `vigiles audit` over the repo-shape matrix — driving the REAL built
 * CLI (`node dist/cli.js audit …`) the way a user does, across Claude Code,
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
  chmodSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

// __dirname is src/ when vitest resolves the .ts source → ".." is the repo root.
const CLI = resolve(__dirname, "..", "dist", "cli.js");
const VENDOR = resolve(__dirname, "..", "examples/harness/vendor");

function run(args: string, cwd?: string): { stdout: string; exitCode: number } {
  // A default `audit` writes vigiles-report.html + vigiles-report.json into cwd —
  // suppress both here so the test run never drops an artifact in the repo root.
  // The dedicated write tests exercise those paths explicitly in a tmp cwd.
  const a =
    args.startsWith("audit ") && !args.includes("--json")
      ? `${args}${args.includes("--no-html") ? "" : " --no-html"}${args.includes("--no-json") ? "" : " --no-json"}`
      : args;
  try {
    const stdout = execSync(`node ${CLI} ${a}`, {
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
    const r = run(`audit ${vendored("oh-my-claudecode")}`);
    assert.equal(r.exitCode, 0, "scan is read-only — always exits 0");
    assert.match(r.stdout, /Detected harness: claude-code/);
    assert.match(r.stdout, /Skills \(\d+\)/);
    assert.match(r.stdout, /MCP servers: yes/); // it ships an MCP server
  });

  it("flags an inherits-all agent in a real plugin (wshobson-accessibility)", () => {
    const r = run(`audit ${vendored("wshobson-accessibility")}`);
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
    const r = run(`audit ${join(root, "normal")}`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Detected harness: claude-code/);
    assert.match(
      r.stdout,
      /Instructions: CLAUDE\.md \(hand-written, no spec\)/,
    );
    assert.match(r.stdout, /no structural issues found/);
  });

  it("Codex repo: detects codex, reports AGENTS.md + skill + TOML MCP", () => {
    const r = run(`audit ${join(root, "codex")}`);
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
    const auto = run(`audit ${join(root, "mixed")}`);
    assert.equal(auto.exitCode, 0);
    assert.match(auto.stdout, /Detected harness: claude-code/);
    assert.match(auto.stdout, /repo also matches: codex/);

    const forced = run(`audit ${join(root, "mixed")} --harness=codex`);
    assert.match(forced.stdout, /Detected harness: codex/);
    assert.doesNotMatch(forced.stdout, /repo also matches/); // override silences it
  });

  it("marketplace root: expands members into a ranked leaderboard", () => {
    const r = run(`audit ${join(root, "mp")}`);
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
    const r = run(`audit ${join(root, "curated")}`);
    assert.equal(r.exitCode, 0);
    assert.match(
      r.stdout,
      /Marketplace "curated": 2 plugin\(s\), all external/,
    );
    assert.doesNotMatch(r.stdout, /no structural issues found/);
    assert.doesNotMatch(r.stdout, /nothing was loaded/);
  });

  it("--json emits the versioned AuditReport (harness + inventory)", () => {
    const r = run(`audit ${join(root, "codex")} --json`);
    assert.equal(r.exitCode, 0);
    const report = JSON.parse(r.stdout) as {
      meta: { schemaVersion: number; harness: string };
      inventory: { skills: number; mcp: boolean };
    };
    assert.equal(report.meta.schemaVersion, 1);
    assert.equal(report.meta.harness, "codex");
    assert.equal(report.inventory.skills, 1);
    assert.equal(report.inventory.mcp, true);
  });
});

// --- folded deterministic fixes in the default `audit` report (was --explain/--fix-plan)

describe("audit default — folds the deterministic fix into the report", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "audit-fixes-e2e-"));
    mkdirSync(join(root, "demo", ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, "demo", ".claude-plugin", "plugin.json"),
      '{"name":"demo"}\n',
    );
    mkdirSync(join(root, "demo", "agents"), { recursive: true });
    // A subagent whose `tools:` names "Reed" — a close typo of the real "Read",
    // so it's silently dropped: the subagent-tool-contract cause, with a
    // did-you-mean fix the default report now surfaces inline.
    writeFileSync(
      join(root, "demo", "agents", "rev.md"),
      `---\nname: rev\ndescription: Reviews code changes for correctness and style across the whole repo here\ntools: Reed\n---\n# rev\nReview stuff.\n`,
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("the default report carries the health score + the ranked FIX with the detector + one-line fix", () => {
    const r = run(`audit ${join(root, "demo")}`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Harness health: [A-F] \(\d+\/100\)/);
    assert.match(r.stdout, /\[FIX\] rev/);
    assert.match(r.stdout, /\[subagent-tool-contract\]/);
    assert.match(r.stdout, /change the tool "Reed" to "Read"/);
  });

  it("--json emits the versioned AuditReport (the upload/CI contract)", () => {
    const r = run(`audit ${join(root, "demo")} --json`);
    assert.equal(r.exitCode, 0);
    const report = JSON.parse(r.stdout) as {
      meta: { schemaVersion: number; tool: string; dir: string };
      score: { overall: number; grade: string };
      recommendations: { surface: string }[];
    };
    assert.equal(report.meta.schemaVersion, 1);
    assert.equal(report.meta.tool, "vigiles");
    assert.ok(report.meta.dir, "meta.dir present");
    assert.ok(
      typeof report.score.overall === "number",
      "score.overall present",
    );
    assert.doesNotMatch(r.stdout, /\[FIX\]/);
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
    const r = run(`generate harness ${dir} ${out}`, REPO);
    assert.equal(r.exitCode, 0, r.stdout);
    assert.ok(existsSync(out));
    const gen = readFileSync(out, "utf-8");
    assert.match(gen, /export const registry =/);
    assert.match(gen, /export type AgentName =/);
    assert.match(gen, /_edge_0: KnownAgentName<"planner", AgentName, "ship">/);
    assert.match(gen, /export const harnessCapabilities =/);
    // --check on the just-written file is a no-op (up to date)
    const chk = run(`generate harness ${dir} ${out} --check`, REPO);
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
        `generate harness ${dupDir} ${join(dupDir, "harness.gen.ts")}`,
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

// --- compile keeps an existing harness.gen.ts fresh ----------------------------
//
// The whole-harness registry tracks specs as a side effect of `compile`, so the
// user never hand-runs `generate-harness`. Opt-in: compile refreshes a registry
// that already exists (committed like a lockfile), never imposes one.
describe("compile refreshes harness.gen.ts", () => {
  const REPO = resolve(__dirname, "..");
  const SPECS: Record<string, string> = {
    "planner.md.spec.ts": `import { agent, result } from "vigiles/spec";
export default agent({ name: "planner", description: "Break the request into an ordered plan. Dispatch first.", tools: ["Read", "Grep", "Glob"], output: result({ steps: "string[]" }, { reason: "string" }) });
`,
    "implementer.md.spec.ts": `import { agent } from "vigiles/spec";
export default agent({ name: "implementer", description: "Implement the plan and prove the build passes.", tools: ["Read", "Edit", "Write", "Bash"] });
`,
    "ship.md.spec.ts": `import { railway, delegate } from "vigiles/spec";
export default railway({ name: "ship", steps: [delegate("planner"), delegate("implementer")] });
`,
  };

  function seed(): string {
    const dir = mkdtempSync(join(REPO, ".tmp-compile-genh-"));
    for (const [name, src] of Object.entries(SPECS))
      writeFileSync(join(dir, name), src);
    return dir;
  }

  it("refreshes a STALE harness.gen.ts on compile", () => {
    const dir = seed();
    try {
      const out = join(dir, "harness.gen.ts");
      writeFileSync(out, "// stale\n");
      const r = run("compile", dir);
      assert.equal(r.exitCode, 0, r.stdout);
      const gen = readFileSync(out, "utf-8");
      assert.match(gen, /export const registry =/);
      assert.match(gen, /KnownAgentName<"planner"/);
      assert.match(r.stdout, /refreshed harness\.gen\.ts/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does NOT create harness.gen.ts when absent (opt-in)", () => {
    const dir = seed();
    try {
      const r = run("compile", dir);
      assert.equal(r.exitCode, 0, r.stdout);
      assert.ok(!existsSync(join(dir, "harness.gen.ts")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- scan --capability-diff e2e (the moat #2 PR-comment surface) ---------------

describe("scan --capability-diff e2e", () => {
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
      const r = run(`audit ${after} --capability-diff=${before}`);
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
      const r = run(
        `audit ${after} --capability-diff=${before} --fail-on-widen`,
      );
      assert.equal(r.exitCode, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports no change when the surface is identical", () => {
    const { after, root } = versions();
    try {
      const r = run(
        `audit ${after} --capability-diff=${after} --fail-on-widen`,
      );
      assert.equal(r.exitCode, 0, "no widening → no gate trip");
      assert.match(r.stdout, /unchanged/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// audit → read-vs-run (env-gated; deterministic via explicit env). A plain
// `audit` is a deterministic READ; the executing checks are opt-in. These run
// non-TTY (execSync pipes), so they're headless — `audit` never PROMPTS, it
// stays a read + a loud nudge. The interactive ask-once path is unit-tested via
// decideExecute.
// ---------------------------------------------------------------------------

describe("audit: read-vs-run (executing checks are opt-in)", () => {
  let dir: string;
  const MODEL_ENV_KEYS = [
    "ANTHROPIC_API_KEY",
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
  ];

  function runEnv(
    args: string,
    env: Record<string, string | undefined>,
  ): string {
    // Start from a copy with all model-access signals stripped, then apply env.
    const base: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (!(MODEL_ENV_KEYS as readonly string[]).includes(k)) base[k] = v;
    }
    try {
      return execSync(`node ${CLI} ${args}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30000,
        cwd: dir,
        env: { ...base, ...env } as NodeJS.ProcessEnv,
      });
    } catch (e: unknown) {
      return (e as { stdout?: string }).stdout ?? "";
    }
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "vigiles-scan-nudge-"));
    mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(dir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "nudge-demo" }),
    );
    mkdirSync(join(dir, "skills", "do-thing"), { recursive: true });
    writeFileSync(
      join(dir, "skills", "do-thing", "SKILL.md"),
      "---\nname: do-thing\ndescription: Does a thing when the user asks to do the thing.\n---\n\nBody.\n",
    );
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("a headless run stays a READ + a loud nudge to --measure (never executes)", () => {
    const out = runEnv("audit .", { CLAUDECODE: "1" });
    assert.ok(out.includes("Executing checks not run"), "read-vs-run nudge");
    assert.ok(out.includes("--measure"), "names the --measure escape");
  });

  it("the nudge is model-agnostic — it's about execution, shown with or without a model", () => {
    const out = runEnv("audit .", {}); // all model signals stripped
    assert.ok(out.includes("Executing checks not run"), "nudge still shown");
  });

  it("stays silent under --json (machine output — no human nudge)", () => {
    const out = runEnv("audit . --json", { CLAUDECODE: "1" });
    assert.ok(
      !out.includes("Executing checks not run"),
      "no nudge in json mode",
    );
  });

  it("--no-interactive never prompts (loud nudge only)", () => {
    const out = runEnv("audit . --no-interactive", { CLAUDECODE: "1" });
    assert.ok(
      out.includes("Executing checks not run"),
      "nudge shown, not a prompt",
    );
  });
});

// ---------------------------------------------------------------------------
// Health-score header in default single-dir scan output
// ---------------------------------------------------------------------------

describe("scan default output — health score header", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "scan-score-"));
    // A clean plugin — CLAUDE.md + one well-formed skill (nothing broken).
    mkdirSync(join(root, "skills", "greet"), { recursive: true });
    writeFileSync(join(root, "CLAUDE.md"), "# Project\nRun the build.\n");
    writeFileSync(
      join(root, "skills", "greet", "SKILL.md"),
      "---\nname: greet\ndescription: Greets the user warmly with a personalised message\n---\nGreet them.\n",
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("prints a Harness health: <grade> (<score>/100) line before the report", () => {
    const r = run(`audit ${root}`);
    assert.equal(r.exitCode, 0);
    // The score header must appear.
    assert.match(r.stdout, /Harness health: [A-F] \(\d+\/100\)/);
    // The report body still follows.
    assert.match(r.stdout, /Scan:/);
  });

  it("score header is absent under --json (machine output)", () => {
    const r = run(`audit ${root} --json`);
    assert.equal(r.exitCode, 0);
    assert.doesNotMatch(r.stdout, /Harness health:/);
    // But the JSON still parses as the versioned AuditReport.
    const report = JSON.parse(r.stdout) as { meta: { dir: string } };
    assert.ok(report.meta.dir, "json has meta.dir");
  });

  it("does NOT run the safety battery on a plain (headless) audit — it's opt-in", () => {
    // A plain audit is a deterministic READ; the executing checks are opt-in. A
    // headless run never executes — no battery section, just the read + a nudge.
    const r = run(`audit ${root}`);
    assert.equal(r.exitCode, 0);
    assert.doesNotMatch(r.stdout, /Safety battery/);
    assert.match(r.stdout, /Executing checks not run/);
  });
});

// ---------------------------------------------------------------------------
// the safety battery is opt-in via --measure (own-direct/confined; foreign
// sandbox-or-skip). A plain audit never runs it (covered above).
// ---------------------------------------------------------------------------

describe("audit safety battery e2e (--measure)", () => {
  let root: string;
  let blockingPlugin: string;
  let permissivePlugin: string;
  let noHooksPlugin: string;

  /** Write a shell script and make it executable; return the absolute path. */
  const writeScript = (dir: string, name: string, body: string): string => {
    const p = join(dir, name);
    writeFileSync(p, body);
    chmodSync(p, 0o755);
    return p;
  };

  /** Wire a hook script into a Claude Code plugin's .claude/settings.json. */
  const wireHook = (pluginDir: string, scriptPath: string): void => {
    const settingsDir = join(pluginDir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: scriptPath }],
          },
        ],
      },
    };
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify(settings, null, 2),
    );
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "scan-check-hooks-"));

    // 1. Blocking plugin — hook exits 2 on any bash call → blocks all disasters.
    blockingPlugin = join(root, "blocking");
    mkdirSync(blockingPlugin, { recursive: true });
    writeFileSync(join(blockingPlugin, "CLAUDE.md"), "# Blocking\n");
    const blockScript = writeScript(
      blockingPlugin,
      "guard.sh",
      "#!/usr/bin/env bash\nexit 2\n",
    );
    wireHook(blockingPlugin, blockScript);

    // 2. Permissive plugin — hook exits 0 (no block) → all disasters slip through.
    permissivePlugin = join(root, "permissive");
    mkdirSync(permissivePlugin, { recursive: true });
    writeFileSync(join(permissivePlugin, "CLAUDE.md"), "# Permissive\n");
    const permitScript = writeScript(
      permissivePlugin,
      "noop.sh",
      "#!/usr/bin/env bash\nexit 0\n",
    );
    wireHook(permissivePlugin, permitScript);

    // 3. No-hooks plugin — nothing wired, battery should report "no runnable safety hooks".
    noHooksPlugin = join(root, "nohooks");
    mkdirSync(noHooksPlugin, { recursive: true });
    writeFileSync(join(noHooksPlugin, "CLAUDE.md"), "# No hooks\n");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // Run the battery as the user's OWN repo (cwd === scanned dir) so the hook
  // executes DIRECT (trusted) — the deterministic path. A non-cwd ("foreign")
  // scan is sandbox-or-skip (env-dependent), covered separately below.
  it("blocking hook (own repo): reports all disasters blocked", () => {
    const r = run(`audit . --measure`, blockingPlugin);
    assert.equal(r.exitCode, 0);
    // Must show a Safety battery section.
    assert.match(r.stdout, /Safety battery/);
    // The blocking hook should block every disaster (N/N).
    assert.match(r.stdout, /blocks (\d+)\/\1 disasters/);
    // Totals line.
    assert.match(r.stdout, /Total: blocks \d+\/\d+ disasters/);
  });

  it("permissive hook (own repo): reports disasters slipping through", () => {
    const r = run(`audit . --measure`, permissivePlugin);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Safety battery/);
    // The permissive hook (exit 0) blocks nothing.
    assert.match(r.stdout, /blocks 0\/\d+ disasters/);
    // The guardrail report names the missed disasters.
    assert.match(r.stdout, /allows/);
  });

  it("foreign plugin: shows the battery sandboxed-or-skipped, never a crash", () => {
    // Scanning a NON-cwd dir runs from the repo root (cwd) → the plugin is
    // foreign → it must sandbox or skip-with-a-loud-note, never run unconfined.
    // Env-robust: pass either way as long as it doesn't crash and the section shows.
    const r = run(`audit ${blockingPlugin} --measure`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Safety battery/);
  });

  it("no-hooks/no-skills plugin: --measure has nothing to run → a clean read", () => {
    // Nothing executable (no hooks, MCP, or skills) → --measure is a no-op; the
    // audit is just the deterministic read, no battery section, no crash.
    const r = run(`audit ${noHooksPlugin} --measure`);
    assert.equal(r.exitCode, 0);
    assert.doesNotMatch(r.stdout, /Safety battery/);
  });
});

// ---------------------------------------------------------------------------
// Default artifacts: vigiles-report.html + vigiles-report.json (the upload boundary)
// ---------------------------------------------------------------------------

describe("audit default artifacts (html + json) written to cwd", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "audit-artifacts-"));
    mkdirSync(join(root, "skills", "greet"), { recursive: true });
    writeFileSync(join(root, "CLAUDE.md"), "# Project\n");
    writeFileSync(
      join(root, "skills", "greet", "SKILL.md"),
      "---\nname: greet\ndescription: Greets the user warmly with a personalised message\n---\nGreet.\n",
    );
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // Run with cwd INSIDE the tmp dir (raw, not the suppressing `run` helper) so the
  // artifacts land in tmp (cleaned), and assert both are written + valid.
  it("writes a self-contained HTML report and a versioned JSON artifact", () => {
    execSync(`node ${CLI} audit .`, { cwd: root, encoding: "utf-8" });
    const html = join(root, "vigiles-report.html");
    const jsonPath = join(root, "vigiles-report.json");
    assert.ok(existsSync(html), "vigiles-report.html written");
    assert.ok(existsSync(jsonPath), "vigiles-report.json written");
    assert.match(readFileSync(html, "utf-8"), /^<!doctype html>/);
    const report = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
      meta: { schemaVersion: number; generatedAt?: string };
      score: { overall: number };
    };
    assert.equal(report.meta.schemaVersion, 1);
    assert.ok(report.meta.generatedAt, "json artifact is timestamped");
    assert.ok(typeof report.score.overall === "number");
  });

  it("--no-html --no-json suppresses both", () => {
    rmSync(join(root, "vigiles-report.html"), { force: true });
    rmSync(join(root, "vigiles-report.json"), { force: true });
    execSync(`node ${CLI} audit . --no-html --no-json`, {
      cwd: root,
      encoding: "utf-8",
    });
    assert.ok(!existsSync(join(root, "vigiles-report.html")), "no html");
    assert.ok(!existsSync(join(root, "vigiles-report.json")), "no json");
  });
});
