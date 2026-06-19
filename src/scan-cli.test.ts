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
  readdirSync,
  rmSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

// __dirname is src/ when vitest resolves the .ts source → ".." is the repo root.
const CLI = resolve(__dirname, "..", "dist", "cli.js");
const VENDOR = resolve(__dirname, "..", "examples/harness/vendor");

function run(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
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
