#!/usr/bin/env node
// Faithful reproduction of caveman's SessionStart activation
// (JuliusBrussee/caveman src/hooks/caveman-activate.js): read the SKILL.md ruleset
// and emit it as hidden SessionStart context, so caveman is "on from message one"
// exactly as on a real Claude Code install (per the README: "On Claude Code, Codex,
// and Gemini it's already on from message one. No command needed."). The upstream
// hook also writes a statusline flag, tracks mode changes, and applies model
// overrides — none of that affects token counts, so it's omitted here. Default
// intensity: full. This is what makes the --plugin-dir arm a FAITHFUL install
// rather than a dormant description-only one.
const fs = require("fs");
const path = require("path");

const root = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, "..");
let body = "";
try {
  const md = fs.readFileSync(
    path.join(root, "skills", "caveman", "SKILL.md"),
    "utf8",
  );
  body = md.replace(/^---[\s\S]*?---\s*/, "");
} catch (e) {
  /* fall through to the minimal ruleset below */
}

const ruleset = body
  ? "CAVEMAN MODE ACTIVE — level: full\n\n" + body
  : "CAVEMAN MODE ACTIVE — level: full\n\n" +
    "Respond terse like smart caveman. All technical substance stay, only fluff die. " +
    "Drop articles (a/an/the), filler, pleasantries, hedging. Fragments OK. " +
    "Technical terms exact. Code blocks unchanged. Errors quoted exact.";

// SessionStart: stdout is injected into the session context (as the upstream hook does).
process.stdout.write(ruleset);
