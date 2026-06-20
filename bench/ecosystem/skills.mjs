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
 *     `examples/harness/vendor/`), never fabricated. See `SOURCES.md`.
 *
 * Each entry's `arm` is the EvalArm that turns the skill ON in the treatment arm
 * (the baseline arm is the same task with nothing added). Two shapes:
 *   - `{ files: { "SKILL.md": … } }` — an injectable telegraphic-prose skill
 *     (caveman-style): the SKILL.md is dropped into the run, exactly as a user
 *     installs it. The clean A/B-able compression shape.
 *   - `{ pluginDir: … }` — a whole real plugin loaded natively (`--plugin-dir`),
 *     so its CLAUDE.md/skills register the real way. The "plugin on vs off" shape.
 *
 * NOTE on the compression CLUSTER (RTK / Claw Compactor / Context Mode / CodeGraph
 * / pinchtab — see research/skill-eval-landscape.md §2): those compress TOOL
 * OUTPUTS via a real CLI/MCP binary, NOT injectable SKILL.md prose, so A/Bing them
 * needs the tool installed and is a documented follow-on — not a manifest entry
 * here. Caveman is the one telegraphic-OUTPUT skill that A/Bs cleanly as a SKILL.md.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const readSkill = (id) =>
  readFileSync(here(`./skills/${id}/SKILL.md`), "utf-8");
const vendor = (slice) => here(`../../examples/harness/vendor/${slice}`);

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
    id: "caveman",
    title: "Caveman Mode",
    source: "JuliusBrussee/caveman@f06348c",
    stars: 75119,
    category: "compression",
    claim: {
      metric: "outputTokens",
      pct: 75,
      text: 'cuts token usage ~75% by "talking like caveman" (telegraphic OUTPUT prose)',
    },
    arm: { files: { "SKILL.md": readSkill("caveman") } },
    provenance:
      "REAL SKILL.md, SHA-pinned (skills/caveman/SKILL.md@f06348c, fetched 2026-06-20). The skill's own description claims ~75%; the README says 65%.",
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
      "SHA-pinned vendored plugin slice (examples/harness/vendor/superpowers@6fd4507). See examples/harness/vendor/SOURCES.md.",
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
      "SHA-pinned vendored plugin slice (examples/harness/vendor/oh-my-claudecode@deee3a4).",
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
      "SHA-pinned vendored plugin slice (examples/harness/vendor/wshobson-accessibility@cf6059d).",
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
