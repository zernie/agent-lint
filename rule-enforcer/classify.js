/**
 * classify — route one atomic agent-rule to how it should be enforced, and
 * reconcile that against what the repo ACTUALLY has.
 *
 * This is Stage 2 of the compiler pipeline (see research/compiler-end-to-end-flow.md).
 * Input is an ATOMIC rule (already segmented — one imperative), so matching can be
 * looser than src/rule-inventory.ts's strict rule-name-only matching: there we scan a
 * whole CLAUDE.md and must not fire on stray prose; here the caller already asserts
 * "this string is a rule", and we decide its class.
 *
 * Four classes:
 *   reuse      → an off-the-shelf rule already enforces it (catalog/rule-map.json).
 *               Reconciled against extract-existing: enforced / warn / off /
 *               contradiction / absent-installed / not-installed.
 *   synthesize → mechanizable but no off-the-shelf rule → the gated synthesis tier.
 *   hook       → an ACTION rule (git push, edit generated files, shell) → a hook,
 *               not a lint rule (ESLint never sees the git command).
 *   semantic   → judgment-only ("clear names", "keep it simple") → labeled prose.
 *
 * Deterministic and dependency-free. The optional reconcile step consumes an
 * extract-existing result (which DID run eslint) — so classify itself execs nothing.
 *
 * KNOWN LIMITATION (first-pass router): keyword matching is polarity-blind — a rule
 * that BANS `??` ("do not use nullish coalescing") keyword-matches the intent that
 * PREFERS `??` (`prefer-nullish-coalescing`), because both are about the same token.
 * The deterministic classifier routes; the opt-in MODEL pass disambiguates polarity
 * and intent before anything is enabled. Never auto-enable a reuse match without the
 * reconcile/contradiction check (and, for opt-in, the model confirmation).
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ruleStatus } = require("./extract-existing.js");

/** Load the plugin index (catalog/rule-map.json). */
function loadRuleMap(file) {
  const p = file || path.join(__dirname, "catalog", "rule-map.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Compile a catalog keyword to a case-insensitive RegExp. Keywords are authored
 * as small regex fragments (e.g. "console\\.", "\\bany\\b type"). Two failure
 * modes are defused by falling back to an ESCAPED-LITERAL match: (1) the fragment
 * isn't valid regex; (2) the fragment matches the EMPTY string — a bare `|`, `^`,
 * `$`, or empty alternation (e.g. the code-operator keyword "no & or |") would
 * otherwise match every rule and collapse all classification onto one intent. */
function keywordRe(keyword) {
  let re = null;
  try {
    re = new RegExp(keyword, "i");
  } catch {
    re = null;
  }
  if (!re || re.test("")) {
    re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  return re;
}

/** Best-matching catalog intent for an atomic rule, or null. Scored by how many of
 * the entry's keywords hit; ties broken by the more specific (more-keyword) entry. */
function matchIntent(ruleText, ruleMap) {
  let best = null;
  let bestScore = 0;
  for (const entry of ruleMap.map) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (keywordRe(kw).test(ruleText)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore > 0 ? best : null;
}

/** ACTION-rule cues: things ESLint can't see (git, filesystem, shell, process). A
 * hook (pre-commit / PreToolUse) is the right gate, not a lint rule. Deliberately
 * specific so it doesn't grab lint rules that merely mention a file. */
const HOOK_CUES = [
  /\bgit\s+push\b/i,
  /\bpush(ing)?\s+(to|straight to|directly to)\s+(main|master|prod)/i,
  /\bforce[- ]?push/i,
  /--no-verify/i,
  /\bnever\s+commit\b/i,
  /\bbefore\s+(you\s+)?commit/i,
  /\brun\s+(the\s+)?tests?\s+before\b/i,
  /\bsign[- ]?off\b/i,
  /\bsigned-off-by\b/i,
  /\b(don'?t|do not|never)\s+edit\b.*\b(generated|\.pb\.|_mock|proto-gen|lock)/i,
  /\bgenerated\s+files?\b/i,
  /\bco[- ]?authored[- ]?by\b/i,
  /\brm\s+-rf\b/i,
  /\bcurl\b.*\|\s*(sh|bash)/i,
  /\bchmod\b/i,
];

function looksLikeHook(ruleText) {
  return HOOK_CUES.some((re) => re.test(ruleText));
}

/** Judgment / no-checker cues — a rule no linter can honestly decide. Matched
 * against the catalog's semantic_no_existing list plus a few generic markers. */
const SEMANTIC_CUES = [
  /\bself[- ]?documenting\b/i,
  /\bclear(er)?\s+(names?|code|over clever)/i,
  /\breadable\b/i,
  /\bkeep it simple\b/i,
  /\bover[- ]?engineer/i,
  /\bsingle responsibility\b/i,
  /\bcomposition over inheritance\b/i,
  /\bmeaningful\b/i,
  /\bidiomatic\b/i,
  /\bwhere (it )?makes sense\b/i,
  /\bappropriate(ly)?\b/i,
];

function looksLikeSemantic(ruleText, ruleMap) {
  for (const s of ruleMap.semantic_no_existing || []) {
    // match on the distinctive head words of each semantic phrase
    const head = s.split(/[\s/]+/).slice(0, 2).join(" ");
    if (head && new RegExp(escapeRe(head), "i").test(ruleText)) return true;
  }
  return SEMANTIC_CUES.some((re) => re.test(ruleText));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Reconcile a matched off-the-shelf rule against the repo's real config. `extract`
 * is an extract-existing result (or null if we didn't/ couldn't run it). */
function reconcile(existingRuleIds, extract) {
  // catalog ids are "core:no-console" / "ts:@typescript-eslint/..." /
  // "plugin:<pkg>:<rule>" / "config:..." — pull the bare rule id to check.
  const bareIds = existingRuleIds
    .filter((id) => !id.startsWith("config:"))
    .map((id) => {
      const parts = id.split(":");
      return parts[parts.length - 1];
    });
  if (!extract || !extract.ok) {
    return { status: "unknown", detail: "no config resolved (not reconciled)" };
  }
  // enforced if ANY mapped rule is on; contradiction if the primary is explicitly off
  const statuses = bareIds.map((r) => ({ r, s: ruleStatus(extract, r) }));
  if (statuses.some((x) => x.s === "error"))
    return { status: "enforced", detail: "already enforced" };
  if (statuses.some((x) => x.s === "warn"))
    return { status: "warn", detail: "set to warn — raise to error" };
  if (statuses.some((x) => x.s === "off"))
    return {
      status: "contradiction",
      detail: "rule is explicitly OFF while the prose says enforce — human call",
    };
  // absent from config: installed plugin or not?
  const plugins = extract.installedPlugins || [];
  const pluginFor = existingRuleIds.find((id) => id.startsWith("plugin:"));
  if (pluginFor) {
    const pkg = pluginFor.split(":")[1]; // eslint-plugin-<pkg> short name
    const installed = plugins.some((p) => p.includes(pkg));
    return installed
      ? { status: "absent-installed", detail: "plugin installed — add the rule" }
      : { status: "not-installed", detail: `install eslint-plugin-${pkg} + enable` };
  }
  return { status: "absent", detail: "core/ts rule not in config — add it" };
}

/**
 * Classify one atomic rule. `opts.ruleMap` (required — pass loadRuleMap()),
 * `opts.extract` (optional extract-existing result for reconciliation).
 */
function classifyRule(ruleText, opts = {}) {
  const ruleMap = opts.ruleMap;
  const text = String(ruleText || "").trim();
  const base = { ruleText: text };

  if (looksLikeHook(text)) {
    return { ...base, class: "hook", action: "generate a pre-commit / PreToolUse hook" };
  }

  const intent = matchIntent(text, ruleMap);
  if (intent) {
    const rec = reconcile(intent.existing, opts.extract);
    return {
      ...base,
      class: "reuse",
      intent: intent.intent,
      mappedRules: intent.existing,
      configFix: intent.config_fix,
      note: intent.note,
      status: rec.status,
      action: rec.detail,
    };
  }

  if (looksLikeSemantic(text, ruleMap)) {
    return { ...base, class: "semantic", action: "keep as labeled prose — not enforceable" };
  }

  return {
    ...base,
    class: "synthesize",
    action: "mechanizable but no off-the-shelf rule — synthesize + gate",
  };
}

/** Classify a batch and return {results, summary}. */
function classifyRules(ruleTexts, opts = {}) {
  const ruleMap = opts.ruleMap || loadRuleMap();
  const results = ruleTexts.map((t) => classifyRule(t, { ...opts, ruleMap }));
  const summary = { reuse: 0, synthesize: 0, hook: 0, semantic: 0 };
  for (const r of results) summary[r.class]++;
  return { results, summary };
}

module.exports = {
  loadRuleMap,
  matchIntent,
  looksLikeHook,
  looksLikeSemantic,
  reconcile,
  classifyRule,
  classifyRules,
};

// CLI: echo rules (one per line) | node classify.js [repoRootForReconcile]
if (require.main === module) {
  const repoRoot = process.argv[2];
  let extract = null;
  if (repoRoot) {
    try {
      extract = require("./extract-existing.js").extractExistingRules(repoRoot);
    } catch {
      /* reconcile stays unknown */
    }
  }
  const input = fs.readFileSync(0, "utf8");
  const rules = input
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const { results, summary } = classifyRules(rules, { extract });
  process.stdout.write(JSON.stringify({ summary, results }, null, 2) + "\n");
}
