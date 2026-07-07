/**
 * A1 — the ecosystem-benchmark MANIFEST: the set of real, hyped Claude Code
 * skills/plugins the benchmark A/Bs over `bench/corpus/coding-tasks.mjs`.
 *
 * The benchmark's whole credibility rests on this list being REAL and PINNED:
 *   - every entry is a real, published skill/plugin (a star count + a source ref);
 *   - compression skills carry the exact published % CLAIM, so the report can lead
 *     with the gap (claimed vs measured — the viral "measured ≪ claimed" debunk);
 *   - the skill text/plugin is sourced reproducibly (a SHA-pinned SKILL.md vendored
 *     under `skills/<id>/`, or a SHA-pinned plugin slice under
 *     `test/dogfood/`), never fabricated. See `SOURCES.md`.
 *
 * Each entry's `arm` is the EvalArm that turns the skill ON in the treatment arm
 * (the baseline arm is the same task with nothing added). Two shapes:
 *   - `{ files: { "SKILL.md": … } }` — an injectable telegraphic-prose skill
 *     (caveman-style): the SKILL.md is dropped into the run, exactly as a user
 *     installs it. The clean A/B-able compression shape.
 *   - `{ pluginDir: … }` — a whole real plugin loaded natively (`--plugin-dir`),
 *     so its CLAUDE.md/skills register the real way. The "plugin on vs off" shape.
 *
 * NOTE on the compression CLUSTER (RTK / CodeGraph / Claw Compactor / Context Mode
 * / pinchtab — see research/skill-eval-landscape.md §2 + SOURCES.md): those
 * compress TOOL OUTPUTS via a real CLI/MCP binary, NOT injectable prose, so A/Bing
 * them needs the tool installed and is a documented follow-on, not a manifest entry
 * here. The cleanly-injectable members are the two prose files: caveman (a SKILL.md)
 * and token-efficient (a CLAUDE.md) — both carry a published % claim.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const readSkill = (id) =>
  readFileSync(here(`./skills/${id}/SKILL.md`), "utf-8");
// Some injectable skills ship as a CLAUDE.md (project-instructions) rather than a
// SKILL.md — read the vendored file by name so the arm injects it the way a user
// actually installs it (token-efficient = CLAUDE.md, auto-loaded as project memory).
const readSkillFile = (id, file) =>
  readFileSync(here(`./skills/${id}/${file}`), "utf-8");
const vendor = (slice) => here(`../../test/dogfood/${slice}`);
// Strip a SKILL.md's YAML frontmatter, leaving the instruction body — used to
// deliver the caveman STYLE as forced-always-on project memory (a CLAUDE.md that
// auto-loads every turn). This is the FIX for the delivery bug the first run hit:
// a bare SKILL.md dropped in cwd via `files` never REGISTERS as a skill (vigiles
// now warns on it — see unregisteredSkillFiles), so the real skill goes through
// `--plugin-dir` (arm.pluginDir, faithful install) and the forced-on steelman
// goes through project memory (CLAUDE.md). See FINDINGS.md.
const stripFrontmatter = (md) =>
  md.replace(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

/**
 * @typedef {Object} Claim
 * @property {"outputTokens"|"costUsd"|"quality"} metric  What the skill claims to move.
 * @property {number|null} pct   The published headline % improvement (null = no single number).
 * @property {string} text       The claim as published, verbatim-ish.
 */
/**
 * @typedef {Object} BenchSkill
 * @property {string} id          Stable benchmark row id.
 * @property {string} title       Human label.
 * @property {string} source      `owner/repo@sha` (or a stable ref).
 * @property {number} stars       Hype proxy (GitHub stars at sourcing time).
 * @property {"compression"|"quality"} category
 * @property {Claim} claim
 * @property {{ files?: Record<string,string>, pluginDir?: string }} arm  Treatment arm.
 * @property {string} provenance  How the text/plugin was sourced (reproducibility).
 */

/** @type {BenchSkill[]} */
export const BENCH_SKILLS = [
  {
    // FAITHFUL INSTALL: caveman registered the real way, via `--plugin-dir`
    // (arm.pluginDir → skills/caveman-plugin/, a proper .claude-plugin around the
    // pinned SKILL.md). This is what a user actually gets: the skill's description
    // is in context and it activates only when its triggers fire ("caveman mode",
    // "be brief", "less tokens") — which neutral coding prompts never say. So this
    // arm measures the IN-THE-WILD reality (likely ~0 activation on normal work).
    id: "caveman",
    title: "Caveman (installed)",
    source: "JuliusBrussee/caveman@f06348c",
    stars: 84189,
    category: "compression",
    claim: {
      metric: "outputTokens",
      // We hold the skill to its README HEADLINE (65%, self-measured on 10 one-shot
      // prompts, range 22–87%) — the more conservative of its two published numbers
      // (the SKILL.md description says ~75%), so the overclaim gap is the STEELMAN,
      // computed against the charitable claim. Matches the article's arithmetic.
      pct: 65,
      text: 'README headline "65%" token cut by "talking like caveman" (telegraphic OUTPUT prose), self-measured on 10 one-shot prompts (range 22–87%); the SKILL.md description claims ~75%.',
    },
    arm: { pluginDir: here("./skills/caveman-plugin") },
    provenance:
      "REAL SKILL.md, SHA-pinned (skills/caveman/SKILL.md@f06348c, fetched 2026-06-20), packaged as a proper Claude Code plugin (skills/caveman-plugin/) so `--plugin-dir` REGISTERS the skill (the earlier run's bare-SKILL.md-in-cwd delivery never loaded — vigiles now warns on it). Stars ~84,189 (verified 2026-07-06). README headline 65%; SKILL.md description ~75%; we benchmark against 65%.",
  },
  {
    // FORCED-ON STEELMAN: the caveman instruction body injected as project memory
    // (CLAUDE.md auto-loads every turn), so the telegraphic style is GUARANTEED
    // active regardless of triggers. The most generous possible test of the
    // compression claim — it removes the "did it activate?" confound and asks: even
    // when caveman is ALWAYS on, does output (and the bill) actually drop? A real
    // install (see `caveman`) only fires on trigger phrases, so real-world savings
    // are <= whatever this arm shows.
    id: "caveman-forced",
    title: "Caveman (forced on)",
    source: "JuliusBrussee/caveman@f06348c",
    stars: 84189,
    category: "compression",
    claim: {
      metric: "outputTokens",
      pct: 65,
      text: 'the same README "65%" claim, tested at its BEST: the caveman style forced always-on via project memory (CLAUDE.md), no trigger required.',
    },
    arm: { files: { "CLAUDE.md": stripFrontmatter(readSkill("caveman")) } },
    provenance:
      "The pinned caveman SKILL.md body (frontmatter stripped) delivered as CLAUDE.md project memory — guaranteed in-context every turn. Steelman delivery: tests pure compression with activation removed as a variable.",
  },
  {
    id: "token-efficient",
    title: "Token-Efficient CLAUDE.md",
    source: "drona23/claude-token-efficient@0d30a6d",
    stars: 5668,
    category: "compression",
    claim: {
      metric: "outputTokens",
      pct: 63,
      // The viral HEADLINE (README "Benchmark Results" table) is a 63% WORD cut
      // over 4 prompts. The repo's OWN reproducible TOKEN benchmark admits the
      // real output-token reduction is ~4% (haiku) / ~12% (sonnet) / ~7% (opus)
      // — the claimed≫measured gap is self-documented upstream.
      text: 'README headline "63%" reduction (a 465→170 WORD count over 4 prompts); the repo\'s own token benchmark measures only ~4% haiku / ~12% sonnet / ~7% opus output-token reduction.',
    },
    // Injected as CLAUDE.md (project instructions) — exactly how it's installed
    // ("one file, drop it in your project"). More faithful than a loose SKILL.md.
    arm: {
      files: { "CLAUDE.md": readSkillFile("token-efficient", "CLAUDE.md") },
    },
    provenance:
      "REAL CLAUDE.md, SHA-pinned (skills/token-efficient/CLAUDE.md@0d30a6d, fetched 2026-06-21), MIT (c) 2026 drona23 (LICENSE vendored alongside).",
  },
  {
    id: "superpowers",
    title: "Superpowers",
    source: "obra/superpowers@6fd4507",
    stars: 0, // hype = a widely-shared workflow plugin; star count not pinned here
    category: "quality",
    claim: {
      metric: "quality",
      pct: null,
      text: "a workflow/skills plugin that claims to make the agent more capable; no single published % — measure the bill + blast radius on neutral tasks.",
    },
    arm: { pluginDir: vendor("superpowers@6fd4507") },
    provenance:
      "SHA-pinned vendored plugin slice (test/dogfood/superpowers@6fd4507). See test/dogfood/SOURCES.md.",
  },
  {
    id: "oh-my-claudecode",
    title: "oh-my-claudecode (OMC)",
    source: "oh-my-claudecode@deee3a4",
    stars: 0,
    category: "quality",
    claim: {
      metric: "quality",
      pct: null,
      text: "an opinionated quality/workflow plugin (agents + skills + hooks); no single published % — measure the bill + blast radius.",
    },
    arm: { pluginDir: vendor("oh-my-claudecode@deee3a4") },
    provenance:
      "SHA-pinned vendored plugin slice (test/dogfood/oh-my-claudecode@deee3a4).",
  },
  {
    id: "wshobson-accessibility",
    title: "wshobson — accessibility",
    source: "wshobson/agents@cf6059d (accessibility plugin)",
    stars: 0,
    category: "quality",
    claim: {
      metric: "quality",
      pct: null,
      text: "a domain skill/agent plugin; off-domain on the neutral corpus — measure the bill it adds + any blast radius.",
    },
    arm: { pluginDir: vendor("wshobson-accessibility@cf6059d") },
    provenance:
      "SHA-pinned vendored plugin slice (test/dogfood/wshobson-accessibility@cf6059d).",
  },
];

/** Select skills by id (comma list); empty/undefined → all. */
export function selectSkills(spec) {
  if (!spec) return BENCH_SKILLS;
  const ids = new Set(
    String(spec)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return BENCH_SKILLS.filter((s) => ids.has(s.id));
}
