/**
 * The shareable HTML audit report. Two renderers, one entry:
 *
 * - `renderAuditHtml(report)` — the DEFAULT: injects the {@link AuditReport} JSON
 *   into the prebuilt **Vite + React + shadcn** template (`report/`, built to one
 *   self-contained file at `dist/audit-report.template.html`). The React app runs
 *   in the reader's browser; the CLI just string-injects the data, so the CLI
 *   stays runtime-dependency-light and the output is still a single offline file.
 * - `renderAuditHtmlSimple(report)` — a zero-dep inline-CSS fallback (used by
 *   `--simple`, and automatically when the built template isn't present, e.g. a
 *   dev checkout that hasn't run the report build). Pure string, no fs.
 *
 * The data is the versioned {@link AuditReport} either way — the same contract a
 * hosted dashboard ingests. `<`/`>`/`&` are escaped on injection so report text
 * can never break out of the `<script>`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AuditReport } from "./audit-report.js";
import type { CategoryScore } from "./audit-score.js";
import type { Recommendation } from "./optimize.js";

const PLACEHOLDER = "__VIGILES_DATA_PLACEHOLDER__";

/**
 * Candidate locations for the built template, relative to this module (`__dirname`
 * is the compiled `dist/` at runtime, or `src/` under vitest). CommonJS output, so
 * we use `__dirname`, not `import.meta`.
 */
function templatePath(): string | null {
  const candidates = [
    resolve(__dirname, "audit-report.template.html"), // dist/ (shipped)
    resolve(__dirname, "..", "dist", "audit-report.template.html"), // src/ under vitest
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Escape a JSON string for safe embedding inside a `<script>` (no `</script>` breakout). */
function embedJson(report: AuditReport): string {
  // Escape <, >, & so report text can never break out of the <script>.
  return JSON.stringify(report).replace(
    /[<>&]/g,
    (ch) => "\\u00" + ch.charCodeAt(0).toString(16).padStart(2, "0"),
  );
}

/**
 * Render via the built React/shadcn template when available (the default), else
 * fall back to the zero-dep inline renderer. `opts.simple` forces the fallback.
 */
export function renderAuditHtml(
  report: AuditReport,
  opts: { simple?: boolean } = {},
): string {
  if (!opts.simple) {
    const p = templatePath();
    if (p) {
      const tpl = readFileSync(p, "utf-8");
      // Replace the quoted placeholder string with the JSON object literal.
      const re = new RegExp(`(["'])${PLACEHOLDER}\\1`);
      if (re.test(tpl)) return tpl.replace(re, embedJson(report));
    }
  }
  return renderAuditHtmlSimple(report);
}

// ---------------------------------------------------------------------------
// The zero-dep inline-CSS fallback (`--simple`)
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Band colors — green/amber/red by score, grey for n/a. Match the terminal glyphs.
function bandColor(score: number | null): string {
  if (score === null) return "#9aa0a6";
  if (score >= 90) return "#0cce6b";
  if (score >= 70) return "#ffa400";
  return "#ff4e42";
}

/** An inline SVG donut ring with the score in the center + a label beneath. */
function ring(score: number | null, label: string, size: number): string {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const pct = score === null ? 0 : score / 100;
  const dash = `${(pct * circ).toFixed(1)} ${circ.toFixed(1)}`;
  const color = bandColor(score);
  const text = score === null ? "n/a" : String(score);
  const numSize = Math.round(size * 0.26);
  const cx = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}: ${text}">
  <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#e8eaed" stroke-width="8"/>
  <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
    stroke-dasharray="${dash}" transform="rotate(-90 ${cx} ${cx})"/>
  <text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="${numSize}" font-weight="700" fill="${color}">${text}</text>
</svg>`;
}

function categoryCard(c: CategoryScore): string {
  const findings =
    c.findings.length > 0
      ? `<ul class="findings">${c.findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
      : `<p class="clean">✓ clean</p>`;
  return `<div class="cat">
  ${ring(c.score, c.key, 96)}
  <div class="cat-body"><h3>${esc(c.key)}</h3>${findings}</div>
</div>`;
}

function fixCard(r: Recommendation): string {
  const tag = r.confidence === "likely" ? "likely" : "possible";
  return `<div class="fix ${tag}">
  <div class="fix-head"><span class="badge">${esc(r.action)}</span> <strong>${esc(r.surface)}</strong> <span class="det">[${esc(r.detector)}]</span></div>
  <div class="why">${esc(r.rationale)}</div>
  <div class="howto">→ ${esc(r.fix)}</div>
</div>`;
}

function inventoryRow(inv: AuditReport["inventory"]): string {
  const cell = (n: number | string, label: string): string =>
    `<div class="stat"><div class="stat-n">${esc(String(n))}</div><div class="stat-l">${esc(label)}</div></div>`;
  return `<div class="inventory">
  ${cell(inv.skills, "skills")}
  ${cell(inv.agents, "agents")}
  ${cell(inv.hooks, "hooks")}
  ${cell(inv.commands, "commands")}
  ${cell(inv.mcp ? "yes" : "no", "MCP")}
  ${cell(inv.untested, "untested")}
</div>`;
}

const STYLE = `
:root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
body { margin: 0; background: #f5f6f7; color: #202124; }
.wrap { max-width: 960px; margin: 0 auto; padding: 32px 24px 64px; }
header { display: flex; align-items: center; gap: 24px; background: #fff; border-radius: 14px; padding: 24px 28px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
header .meta h1 { margin: 0 0 4px; font-size: 22px; }
header .meta .sub { color: #5f6368; font-size: 14px; }
.grade { font-size: 15px; color: #5f6368; margin-top: 6px; }
h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #5f6368; margin: 36px 0 14px; }
.cats { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.cat { display: flex; gap: 16px; align-items: flex-start; background: #fff; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.cat-body h3 { margin: 6px 0 8px; font-size: 16px; }
.findings { margin: 0; padding-left: 18px; color: #3c4043; font-size: 14px; }
.findings li { margin: 2px 0; }
.clean { color: #0c8a4b; margin: 8px 0 0; font-size: 14px; }
.fix { background: #fff; border-left: 4px solid #ffa400; border-radius: 8px; padding: 12px 16px; margin: 10px 0; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
.fix.likely { border-left-color: #ff4e42; }
.fix-head { font-size: 15px; }
.badge { background: #eef; color: #335; border-radius: 4px; padding: 1px 7px; font-size: 12px; text-transform: uppercase; }
.det { color: #80868b; font-size: 13px; }
.why { color: #3c4043; font-size: 14px; margin: 4px 0; }
.howto { color: #1a73e8; font-size: 14px; }
.inventory { display: flex; gap: 12px; flex-wrap: wrap; }
.stat { background: #fff; border-radius: 10px; padding: 14px 22px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.06); min-width: 76px; }
.stat-n { font-size: 24px; font-weight: 700; }
.stat-l { color: #5f6368; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
footer { margin-top: 40px; color: #80868b; font-size: 12px; text-align: center; }
`;

/** The zero-dep, single-file fallback report (pure string; no template, no fs). */
export function renderAuditHtmlSimple(report: AuditReport): string {
  const s = report.score;
  const overallColor = bandColor(s.empty ? null : s.overall);
  const cats = s.categories.map(categoryCard).join("\n");
  const fixes =
    report.recommendations.length > 0
      ? `<h2>Fixes (${String(report.recommendations.length)})</h2>${report.recommendations.map(fixCard).join("\n")}`
      : `<h2>Fixes</h2><p class="clean">✓ no deterministic fixes — the structure is clean.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>vigiles audit — ${esc(report.meta.dir)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header>
    ${ring(s.empty ? null : s.overall, "overall", 132)}
    <div class="meta">
      <h1>Harness audit</h1>
      <div class="sub">${esc(report.meta.dir)} · ${esc(report.meta.harness)}</div>
      <div class="grade" style="color:${overallColor}">Harness health: <strong>${esc(s.grade)}</strong> (${String(s.overall)}/100)</div>
    </div>
  </header>

  <h2>Categories</h2>
  <div class="cats">${cats}</div>

  ${fixes}

  <h2>What it ships</h2>
  ${inventoryRow(report.inventory)}

  <footer>Generated by vigiles — we run your harness, not just read it.</footer>
</div>
</body>
</html>`;
}
