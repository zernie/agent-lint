/**
 * v0 plugin-health-leaderboard GENERATOR (manual, needs network + a built dist/).
 *
 * Clones each repo in corpus.json shallow, finds every on-disk plugin root (a dir
 * holding `.claude-plugin/plugin.json`), ranks them with the deterministic
 * structural-health engine (no model, the free column), and writes RESULTS.md — a
 * grade-distribution summary + the full ranked Markdown table + reproducible
 * provenance (repo + cloned SHA). We publish SCORES only; no plugin code is vendored.
 *
 *   node bench/leaderboard/run.mjs
 *
 * NOT a CI step (it reaches the network). The engine it drives (rankPlugins /
 * formatLeaderboardMarkdown) IS unit-tested in src/leaderboard.test.ts.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  rankPlugins,
  formatLeaderboardMarkdown,
} from "../../dist/leaderboard.js";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, "corpus.json"), "utf-8"));

const root = mkdtempSync(join(tmpdir(), "vigiles-leaderboard-"));
const provenance = [];
const pluginDirs = [];

for (const repo of corpus.repos) {
  const dest = join(root, repo.replace("/", "_"));
  try {
    execSync(`git clone --depth 1 https://github.com/${repo}.git "${dest}"`, {
      stdio: "ignore",
    });
  } catch {
    console.error(`skip ${repo} — clone failed`);
    continue;
  }
  const sha = execSync("git rev-parse --short HEAD", { cwd: dest })
    .toString()
    .trim();
  // Every dir holding `.claude-plugin/plugin.json` is a plugin root.
  const found = execSync(
    `find "${dest}" -path '*/.claude-plugin/plugin.json' -not -path '*/node_modules/*'`,
    { encoding: "utf-8" },
  )
    .split("\n")
    .filter(Boolean)
    .map((p) => dirname(dirname(p)));
  for (const d of found) pluginDirs.push(d);
  provenance.push({ repo, sha, plugins: found.length });
  console.error(`${repo}@${sha} — ${String(found.length)} plugin(s)`);
}

const scores = rankPlugins(pluginDirs);

// Grade distribution (the headline: how healthy is the ecosystem slice?).
const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
for (const s of scores) dist[s.grade]++;
const distLine = Object.entries(dist)
  .map(([g, n]) => `${g}: ${String(n)}`)
  .join(" · ");

const md = [
  "# Plugin health leaderboard — v0",
  "",
  `_Generated ${new Date().toISOString().slice(0, 10)} by \`bench/leaderboard/run.mjs\`. ` +
    `Deterministic structural health only (no model) — the free column of \`vigiles scan\`._`,
  "",
  "## Corpus",
  "",
  "Public Claude Code plugin repos with on-disk `.claude-plugin/plugin.json` roots. " +
    "Scores only; no plugin code is vendored.",
  "",
  "| repo | sha | plugins |",
  "| :-- | :-- | --: |",
  ...provenance.map(
    (p) =>
      `| [${p.repo}](https://github.com/${p.repo}) | \`${p.sha}\` | ${String(p.plugins)} |`,
  ),
  "",
  `**${String(scores.length)} plugins ranked.** Grade distribution: ${distLine}.`,
  "",
  "> ⚠️ v0 scope: a `wshobson/agents`-heavy sample (the ecosystem's largest single " +
    "collection) + `superpowers`. Broadening to more authors is the next step. This " +
    "proves the at-scale engine and surfaces the health distribution; it is not yet " +
    "the definitive ecosystem ranking.",
  "",
  "## Ranking",
  "",
  formatLeaderboardMarkdown(scores),
  "",
].join("\n");

const outPath = join(here, "RESULTS.md");
writeFileSync(outPath, md);
console.error(`\nwrote ${relative(process.cwd(), outPath)}`);
// Clean the clones; we keep only the scores.
execSync(`rm -rf "${root}"`);
