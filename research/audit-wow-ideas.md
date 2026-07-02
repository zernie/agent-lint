---
status: active
topic: audit
---

# Audit "wow" ideas — making `vigiles audit` land an "oh shit", not a green A

> Research record, 2026-06-29. Question: what can `vigiles audit` CHECK (deterministic)
> and MEASURE (model-gated, on the sub) to create TENSION — surprising, specific,
> "I need to fix that" findings — beyond today's four rings (Truthfulness / Triggering /
> Structure / Tested), which land as a boring green A on most plugins?
>
> Built from a 3-stream parallel fan-out (deep-research skill). Full per-stream appendices
> preserved below (§Appendix). `startup/` vault was LOCKED (git-crypt) and left locked.

## TL;DR — the three findings

1. **Do NOT add more deterministic markdown checks.** That space is saturated: agnix
   (~432 rules), claudelint/pdugan20 (114), Emasoft CPV (190+), SkillCheck, skill-validator
   (150+), AgentLint (58), AgentLinter (38), cclint ×2, thedaviddias/skill-check (22),
   agentigy/skillcheck (security). They all do frontmatter / length / naming / secret-scan /
   dangerous-command / dead-link. Competing on rule count is a losing game.

2. **The wow is what a linter STRUCTURALLY can't do** — and audit already half-owns it:
   - **Cross-referencing against reality** (a rule/path/script/symbol exists AND is enabled
     across 7 catalogs; a live `mcp__server__tool` resolves). Confirmed UNMATCHED — no tool
     in the sweep does catalog-grounded cross-reference. This is the Truthfulness moat; extend
     it to skill bundled-resources and live MCP.
   - **A Safety / blast-radius ring** — the lethal-trifecta state check, false-confidence hook
     audit, the "does your guard actually block" battery, observed-vs-declared egress. No
     competitor reasons about the harness's _capability state space_.
   - **Behavioral measurement on the sub** — does the skill FIRE (recall/precision), does the
     hyped skill actually help (claim-vs-measured), does your gate hold under attack
     (adversarial-gate). promptfoo/DeepEval bill per token and can't load the real harness.

3. **Tension is missing because the gradeable checks are rare and the common findings are
   advisory.** Everyone gets an A (vendored sweep: 100/100/92/92) because inherit-all and
   untested were demoted to advisory (rightly — to not cry wolf). The fix is NOT to re-grade
   those; it's to add NEW gradeable findings that are real and high-precision (the Safety ring
   - false-confidence hooks), and to surface the behavioral reds (a skill firing 30% IS an F).

## Why audit is thin today (grounded in a real run)

`audit` on a vendored plugin → `A 92`, one finding (a tool typo), one advisory note. Leaderboard
across four → everyone's an A. A health dashboard where everyone passes is boring. Three root
causes: (1) the only graded penalties are rare (dead ref, missing hook); (2) the common findings
(inherit-all, untested) are advisory; (3) the genuinely surprising signal (firing rate, blast
radius) is hidden behind an opt-in model tier or not built. Plus an anti-wow wart: the backwards
dialect-drift banner reads as "the tool is broken."

## The ranked shortlist

Legend: **DET** = deterministic, no model, free, CI-safe. **RUNS** = executes confined, no model
(opt-in behind audit consent). **MG** = model-gated, runs on the Claude sub. ★ = unique, a
linter/agnix/`claude plugin validate` structurally can't produce it.

### Tier 1 — ship-now, highest tension, deterministic + linter-impossible

| #   | Idea                                                         | What it catches                                                                                                                                                                                                       | Ring                   | Effort | Source               |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------ | -------------------- |
| 1   | **Lethal-trifecta exposure ★**                               | A unit whose declared tools+MCP hold all three of {private-data read} ∧ {untrusted-content intake} ∧ {exfil channel} — prompt-injection exfil with no exploit code. Pure set-intersection over the effect classifier. | **NEW Safety**         | M      | vault HS-1, gh D1    |
| 2   | **Block decision on a non-blocking event ★**                 | A hook that emits `exit 2` / `"decision":"block"` on PostToolUse/SessionStart/etc. — the action already ran; the block is silently ignored (CC even prints "blocking error"). Real bug #19009 (closed not-planned).   | Safety / Gating        | S      | gh A1                |
| 3   | **Wrong JSON block field for the event ★**                   | PreToolUse needs `hookSpecificOutput.permissionDecision:"deny"`; a copied PostToolUse template using top-level `decision` silently never blocks.                                                                      | Safety / Gating        | S–M    | gh A2, vault HP-2    |
| 4   | **Missing opening `---` → invisible skill ★**                | A SKILL.md starting with `name:` (no opening fence) loads as pure body — no name, no trigger, never fires. Trivial check, huge real impact.                                                                           | Triggering             | S      | gh B1                |
| 5   | **`.env` deny gives false confidence ★**                     | `deny:["Read(./.env)"]` with no PreToolUse Bash hook inspecting the command — `cat .env` bypasses file perms entirely. Flag the gap.                                                                                  | Safety                 | M      | gh D5                |
| 6   | **Dangerous default permissions ★**                          | `permissions.allow` with `Bash(*)`/`*`/wildcards, baked-in `--dangerously-skip-permissions`, or an auto-approve PreToolUse hook = no guardrail.                                                                       | Safety                 | S      | gh D4                |
| 7   | **Secrets in config / settings.local.json not gitignored ★** | Key-shaped literals in settings.json/.mcp.json/CLAUDE.md; MCP `env` literal not an env-ref; `.claude/settings.local.json` absent from `.gitignore` (#13106).                                                          | Safety                 | S–M    | gh D3                |
| 8   | **Instruction file over the harness truncation limit ★**     | Byte budget per harness (Codex silently truncates AGENTS.md ~32 KB, #13386/#7138; CC warns). Late instructions never reach the model. Per-harness threshold in the dialect.                                           | Truthfulness           | S      | gh E4                |
| 9   | **Functional dirs inside `.claude-plugin/` ★**               | The #1 plugin-author mistake — only `plugin.json` belongs there; nested skills/agents/commands are invisible.                                                                                                         | Structure              | S      | gh E1                |
| 10  | **Hook matcher won't fire ★**                                | `mcp_memory_*` instead of `mcp__memory__.*`, `bash`≠`Bash`, an `mcp__server__` matcher naming an undeclared server. Extend mcp-tool-resolves to hook matchers.                                                        | Triggering / Structure | S–M    | gh A5, vault HS-5    |
| 11  | **Instruction-vs-config contradiction ★**                    | File says "use tabs", prettier enforces spaces; "run tests before commit" with no hook. Cross-reference prose intent against the real linter/formatter/hook config.                                                   | **NEW Consistency**    | M      | vault HS-4           |
| 12  | **Skill bundled-resource resolution ★**                      | Verify a skill's wrapped scripts/commands/reference-files exist and resolve (one practitioner found 59 broken refs in 192 files; 73% of 214 skills scored <60). The cross-ref moat applied to SKILL.md.               | Truthfulness           | S–M    | vault SK-1           |
| 13  | **Stale subagent-bypass / delivery caveat ★**                | When a hook is a security gate AND the plugin dispatches subagents (Task), warn the gate doesn't cover subagent tool calls (#34692/#21460/#40241). Honest-scope, never claims a fix.                                  | Safety (advisory)      | M      | gh A6/C1, vault HP-4 |

### Tier 2 — the behavioral reds (model-gated, on the sub) — where the F's come from

| #   | Idea                                                                       | What it measures                                                                                                                                                                                                                               | Ring                   | Effort | Source           |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------ | ---------------- |
| 14  | **Trigger-rate recall + precision ★ (shipped)**                            | Does the skill actually FIRE on varied prompts, and stay quiet on irrelevant ones. A 30% recall IS an F. Already audit's behavioral column — promote it from opt-in footnote to the hero.                                                      | Triggering             | S      | vault MA-1       |
| 15  | **"Does your guard actually block" battery ★ (shipped, parked as a ring)** | Feed the disaster catalog (force-push incl. `cd x && git push -f`, rm -rf, --no-verify, ssh-key read, curl\|sh) to the real hook → "blocks 2/7". The most visceral finding. Re-promote to a Safety ring once cross-platform confinement lands. | Safety                 | S      | vault HP-1       |
| 16  | **Claim-vs-measured ROI ★**                                                | A/B a hyped skill on a real-task corpus → token delta + still-fires + correctness regression. "caveman claims 65%, measured −5%." The viral vaporware debunk.                                                                                  | **NEW Cost/ROI**       | M      | vault MA-3       |
| 17  | **Adversarial-gate test ★**                                                | Ask the agent to skip its own gate; assert refusal. If it caves, the prose gate enforces nothing — and vigiles supplies the deterministic hook fix (the eval→enforce bridge).                                                                  | **NEW Enforceability** | M      | vault MA-2       |
| 18  | **Observed egress vs declared ★**                                          | Boot the plugin's hooks confined, list hosts reached vs declared. Caught a real plugin's silent npm phone-home every session. "I ran it, here's what it did."                                                                                  | Safety                 | M      | vault SC-1, HS-3 |
| 19  | **Score-explainer ★ (shipped)**                                            | The deterministic WHY behind a low measured score: "underperforms BECAUSE its description collides with X — here's the one-line fix." The Lighthouse "Opportunities" analog; pairs every red with its cause.                                   | cross-cuts             | S      | vault MA-5       |
| 20  | **Two-number testability rollup ★**                                        | Replace the boring coverage % with "% testable free+sub vs % needs-a-container" so "model-gated" never reads as "uncovered".                                                                                                                   | Tested                 | M      | vault EC-1       |

### Tier 3 — roadmap / heavy (the depth play, not launch)

Capability-diff at PR time (TS-1, "this PR widened your agent's blast radius" — founder favorite,
unbuilt); covering-array interaction testing (TS-3); CI-for-model-upgrades ("Opus 4.9 dropped your
skill's trigger 40%", DB-2); cross-harness behavioral differential (HS-9); self-improving harness
(DB-3); signed observed-vs-declared attestation badge (SC-4); MDL/derivable-token-% (HS-6);
content-addressed refs (HS-11); spec-evolution hygiene (LM-3, parked).

## Proposed new rings (beyond the four)

- **Safety / blast-radius** — the densest cluster of high-tension findings (#1, #2, #3, #5, #6,
  #7, #13, #15, #18). The single biggest lever. Currently parked behind cross-platform
  confinement _only for the executing battery_ — the STATIC half (trifecta, false-confidence
  protocol read, dangerous permissions, secrets) is side-effect-free and shippable now.
- **Consistency** — instruction-vs-config / vs-hook / vs-file / ephemeral-in-durable (#11).
- **Enforceability** — does your gate hold under attack (#17).
- **Cost / ROI** — claim-vs-measured, dead-weight, derivable-% (#16).

## What NOT to build (the saturated lane)

Frontmatter/name/length/token-budget/secret-regex/dangerous-command-regex/dead-link checks are
done to death (see §Appendix C). Adopt or delegate; don't reinvent. The only reason to ship a
"structural" check is if it's catalog-grounded (cross-reference) or state-space-aware (trifecta) —
i.e. something the 432-rule linters structurally cannot do.

---

# Appendix

The full per-stream records (verbatim sources, issue numbers, dates) were gathered to the session
scratchpad and are summarized below. The three streams:

## Appendix A — vault stream (saved internal ideas)

~40 ideas mined from research/harness-state-space.md (richest — trifecta HS-1, least-privilege
HS-2, declared-vs-observed effects HS-3, contradiction class HS-4, matcher-coverage HS-5, MDL HS-6,
capability-graph HS-7, illegal-states HS-8, cross-harness HS-9, metamorphic HS-10), hook-pain-points.md
(battery HP-1, false-confidence HP-2, dead-event HP-3, delivery-bug caveat HP-4),
agent-supply-chain-security.md (egress SC-1, contract-drift SC-2, tool-poisoning SC-3, attestation
SC-4), skill-eval-landscape.md (trigger-rate MA-1, adversarial-gate MA-2,
claim-vs-measured MA-3, cost/ROI MA-4, score-explainer MA-5, description-overlap MA-6),
skill-authoring-pains.md (bundled-resource SK-1, frontmatter SK-2, volume SK-3),
oss-pr-drafts/oss-audit-render-findings.md (never-available tool OSS-1, prose-only subagent OSS-2),
eval-coverage-and-isolation.md (two-number rollup EC-1, record-replay EC-2),
landscape-mid-2026.md (Cedar LM-1, live-MCP LM-2, spec-evolution LM-3 parked).

## Appendix B — GitHub OSS-failure stream (real issues, dated 2026-06-29)

Hooks false-confidence: #19009 (block on non-blocking event, closed not-planned), `decision` vs
`permissionDecision`, exit-1≠exit-2, Stop-hook infinite loop, matcher mistakes, subagent-bypass
#21460/#34692/#40241/#54898, ${CLAUDE_PLUGIN_ROOT} unresolved. Skills: missing `---` → invisible,
vague/narrow descriptions undertrigger, collisions. Security/Safety ring: lethal trifecta
(Simon Willison 2025-06-16; GitHub MCP exfil 2025-04-09; OWASP MCP03 Tool-Poisoning), MCP tool
poisoning/rug-pull (Invariant Labs, MCPTox arXiv 2508.14925), secrets #13106, dangerous default
permissions, `.env` Bash-bypass. Config/structure: functional dirs in `.claude-plugin/`,
marketplace.json resolution #11278/#11243/#56043/#33739/#17298, instruction-file truncation
Codex #13386/#7138, Codex skills.config ignored #14161/#27705. Primary practitioner source:
morphllm.com/claude-code-hooks (2026); ice-ice-bear plugin deep-dive (2026-04-03);
agensi.io skills troubleshooting (2026).

## Appendix C — adjacent-tools / gap stream

**The crowded deterministic field** (do not compete on count): agnix ~432 rules (security:
prompt-injection/overpermissive-tools/exposed-secrets; cross-platform); claudelint/pdugan20 114
rules / 10 categories (claude-md-import-missing/circular, skill-_, mcp-_, plugin-_, agent-_);
Emasoft CPV 190+ rules / 25 scripts (notably 5 silent-failure modes `claude plugin validate`
misses: agents-folder-path drop, hooks-override cascade disabling MCP, MCP/LSP name-collision
shadowing); SkillCheck-Free (OWASP Agentic ASI-02…ASI-11 as 8 deterministic checks, trigger-collision

- eval-kit in Pro); skill-validator 150+ (contamination analysis, LLM scoring); AgentLint 58 / 8
  dimensions (incl. a Harness dimension: hook-event validity, Stop-circuit-breaker, dangerous
  auto-approve); AgentLinter 38; cclint ×2; thedaviddias/skill-check 22; agentigy/skillcheck (CWE-mapped
  security); AgentEval (contradiction + git-history benchmark-task gen + regression gating — closest to
  vigiles's eval angle). **Official:** `claude plugin validate` is intentionally narrow (manifest schema
- `--strict`); the `plugin-validator` agent cross-checks paths/events/tools but is a manual agent with
  no rule IDs; **issue #62400** — validate says "pass" but the runtime rejects (schema divergence) = a
  gap vigiles could own. **MCP:** devtk/mcpserverspot/mcptools (schema), MCP Inspector + RHEcosystem +
  Janix (runtime protocol), **mcp-scan/Invariant** (tool-poisoning, rug-pull, cross-server shadowing,
  lethal-trifecta-shaped data-flow) — delegate the generic scan, own the harness-wiring view.
  **Eval vendors** (all bill per token, none load the real shipping harness): promptfoo (deterministic
  assertion engine over YAML providers; `claude-agent-sdk` provider does NOT load CLAUDE.md/hooks by
  default; trajectory needs OTel; ~130 red-team plugins incl. a `coding-agent:*` family —
  secret-env-read/sandbox-write-escape/network-egress-bypass/verifier-sabotage); DeepEval (34/35 metrics
  LLM-judge; only JsonCorrectness deterministic; ToolCorrectness needs a pre-specified expected list);
  Langfuse/Patronus (LLM-as-judge dimensions: hallucination/faithfulness/toxicity/helpfulness).
  **Lighthouse template:** its 5 weighted categories (Perf/A11y/Best-Practices/SEO/PWA) are the model
  for audit's rings — weighted sub-scores, "Opportunities" (= score-explainer), pass/fail diagnostics.

## Competitive reality check (the late agnix/AgentLint data sharpened this)

A full rule-by-rule dump of agnix (432 rules) and AgentLint (58 checks, incl. a "Harness"
dimension H1–H8 and a "Safety" dimension S1–S9) shows several Tier-1 "deterministic" ideas
above are **already covered** by incumbents, deterministically:

- #6 dangerous default permissions → agnix CC-AG-012 (bypass-permissions warning), AgentLint
  H4 (dangerous auto-approve).
- #7 secrets in config → agnix MCP-018/KR-MCP-002/CDX-CFG-010, AgentLint S6, every linter.
- #8 instruction-file truncation → agnix XP-007/CDX-005, AgentLint I7.
- #9 functional dirs in `.claude-plugin/` → agnix CC-PL-002, claudelint, `claude plugin validate`.
- #10 hook-event/matcher typo → agnix CC-HK-001/004, AgentLint H1, cclint.
- #4 missing `---`/unreachable skill → agnix AS-001/CC-SK-011 (partial).
- #11 instruction-vs-config contradiction → agnix XP-004/XP-005 (partial — build/test +
  tool-constraint conflicts).

So ship those for COMPLETENESS, but they are NOT the wow — incumbents have them. What remains
**genuinely unique to vigiles, owned by no tool in the sweep:**

1. **Lethal-trifecta (capability state-space intersection)** — confirmed: NO linter, and not
   even mcp-scan (which does data-flow at _runtime_), checks the static tool-SET for the
   {private ∧ untrusted ∧ exfil} triangle. ★ the single most defensible new check.
2. **Cross-reference against reality** — rule-exists-AND-enabled across 7 linter catalogs +
   live `mcp__server__tool` resolution. The existing moat; unmatched.
3. **False-confidence hook PROTOCOL audit** — "exit 2 / `decision:block` on a NON-blocking
   event" (#19009) and wrong-JSON-field. agnix has CC-HK-002 (prompt-hook-wrong-event) and
   CC-HK-004 (matcher-on-non-tool-event) but NOT the block-decision-silently-ignored check.
   Mostly unique.
4. **The behavioral tier** — does the skill FIRE (trigger-rate), does the hyped skill HELP
   (claim-vs-measured A/B), does the gate HOLD under attack (adversarial-gate), does the guard
   actually BLOCK (battery). The only model-gated competitor checks (AgentLint D1–D3
   contradiction/dead-weight, SS1–SS4 session logs) don't touch firing/ROI/enforcement. Unique,
   and uniquely affordable (the sub, not metered API).

## OWASP grounding for the Safety ring

The OWASP Top-10-for-LLM-2025 + Top-10-for-Agentic-2026 (ASI01–ASI10) + MCP-Top-10 map cleanly
onto deterministic harness checks, which gives the Safety ring an authoritative spine: LLM06
Excessive Agency → effect-surface/purity (vigiles already strong); LLM02 Sensitive-Info +
the lethal-trifecta → check #1; LLM03/ASI04/MCP04 Supply Chain → unpinned-MCP-dep + hook-stamp;
ASI05/MCP05 Code-Execution → the DISASTER battery + CommandView AST (strong); MCP03 Tool-Poisoning
→ injection-pattern scan + server-allowlist; MCP01 Token-Mismanagement → secrets-in-config. The
trifecta check is literally LLM02 + ASI02 made static. Framing the Safety ring as "your OWASP
Agentic exposure, checked statically and free" is a credible, non-hype headline.

## The handling-mode matrix: prevent vs detect vs measure (the construct/verify moat)

The public face of this is `docs/what-vigiles-catches.md` (sanitized, shipped-only,
benefit-framed). The strategic point it encodes — and the reason it's a defensible
artifact no competitor can copy — is the PREVENT column.

Every issue is handled in one of three modes, and the differentiator is the first:

- ✦ **PREVENT (construct)** — UNREPRESENTABLE; won't compile. The typed spec / compiled
  hook makes the mistake impossible to write. **agnix/claudelint/CPV (432/114/190+ rules)
  STRUCTURALLY CANNOT have this column** — markdown is inert, so all they can ever do is
  lint-after-the-fact. A `.spec.ts` is a PROGRAM, so the whole PL toolbox (types,
  totality, effect rows) applies. This is "unsafe harnesses don't compile" made into a
  user-facing table. Shipped today: compiled-hook protocol (false-confidence exit/field
  unrepresentable; block-on-no-decision-event = tsc error), typed purity floor
  (over-power/trifecta-as-type), typed composition (handoff mismatch won't compile),
  closed hook vocabulary (out-of-vocab import won't compile), generate-harness (dangling
  delegate = tsc error).
- ✓ **DETECT (verify)** — deterministic, free, no model; `audit` (report) + `lint` (gate),
  ONE detector both call (one-detector-no-drift). This column is table-stakes-ish (agnix
  competes here on rule COUNT) EXCEPT the catalog-grounded cross-reference (rule exists AND
  enabled across 7 catalogs) + the lethal-trifecta capability set-intersection, which no
  competitor has. Don't compete on count; compete on the two cross-ref/state checks.
- ◷ **MEASURE (test/eval)** — model-gated, on the sub. Trigger-rate (fire? recall+precision),
  claim-vs-measured A/B, the disaster battery, adversarial-gate. The one thing NO linter on
  earth can do; uniquely affordable because it runs on the user's Claude subscription, not a
  metered API.

The same logical check can occupy MORE than one mode — the trifecta is DETECT today (Safety
ring) and PREVENT under a declared purity floor; a reference is DETECT in audit and PREVENT
in a typed spec. That overlap is the adoption ladder (markdown floor → typed spec) made
concrete: a user starts at DETECT (zero adoption, audit on any repo) and graduates to
PREVENT as they adopt specs/compiled hooks.

SHIPPED since (all DETECT-mode, deterministic, FP-safe, audit + lint, one-detector-no-drift):
`skill-missing-fence` (the invisible-skill / missing-`---` check), `plugin-dir-layout`
(functional dirs misplaced inside `.claude-plugin/`), and `delegation-trifecta` (the
capability-diff across the subagent delegation tree — a lethal trifecta that emerges across an
edge though no single unit trips it; the F1 idea from the Flue poach, Appendix D), plus the two
hook false-confidence detectors: `hook-block-ineffective` and `hook-matcher` (tool-name typo /
malformed or undeclared MCP matcher form). CALIBRATION (PR #52 review): `hook-block` `wrong-event`
fires ONLY on events where a block does NOTHING AT ALL (`noEffectHookEvents` =
SessionStart/SessionEnd/Notification/PreCompact) — NOT `PostToolUse`, where `exit 2` is a legitimate
FEEDBACK channel (the dogfood caught it crying wolf on vigiles's own `refs-nudge.sh`); intent isn't
deterministically separable, so we don't flag it. The davila7 vendored slice flipped from
true-positive to a calibration FP-guard. Plus `wrong-field` (legacy top-level `decision` on
PreToolUse). The Codex reviewer also found + we fixed: feed per-registration resolved-path hook
entries (not a de-duped script list), extract the server from a wildcard MCP matcher, count the new
findings in the audit verdict footer, and distinguish explicit-empty `tools: []` from inherits-all.

PLANNED (the remaining OSS-scan harvest, all DETECT-mode, mostly S-effort, deterministic,
FP-safe): secrets-in-config / settings.local-not-gitignored, dangerous-default-permissions,
`.env`-deny-Bash-bypass, `@import` resolution, instruction-file truncation limit,
skill-description >250-char cap. Build each detector → audit + lint, fix message points at the
PREVENT path (compiled hook / typed spec) where one exists.

KEY HONESTY for the public table: only SHIPPED handling goes in the matrix cells; planned
checks live in a clearly-marked "On the roadmap" list (never claim vaporware as a current
capability — the never-fabricate/credibility rule extends to the coverage matrix).

## Highest-conviction next step

If picking ONE thing to build for the launch: **the lethal-trifecta check (#1) + the static
false-confidence hook audit (#2/#3/#6)**, shipped as a new **Safety ring**. All deterministic,
side-effect-free, high-precision, and structurally impossible for the 432-rule linters — and they
turn a green A into "your agent can read your secrets and exfiltrate them, and your safety hook
doesn't fire." That is the "oh shit."

---

# Appendix D — Flue poach (2026-06-29): a typed TS harness validates the bet + opens surfaces

Flue (flueframework.com, withastro/flue — Fred Schott / the Astro team, "The Open Agent
Framework", 1.0 beta) is a **programmable TypeScript agent harness**: you author
`defineAgent()` / `defineTool()` / `defineSkill()` / `defineWorkflow()` / `defineAgentProfile()`
(subagents) in TYPED TS, with **Valibot input/output schemas** on tools and workflows, and it
ALSO **imports existing Claude Code `SKILL.md` directories** (same progressive-disclosure
activation). Layout: `agents/{name}.ts`, `src/workflows/`, `flue.config.ts`, `.env`; model
specifiers are `provider/model` (`anthropic/claude-sonnet-4-6`). Code-module harness (in-process,
no shell hooks) — the OpenCode capability row. Powered by "Pi" harness; runs on Node/Cloudflare.

**Why it matters:** Flue is a RUNTIME framework (it RUNS agents); vigiles is the PRE-RUN
verifier/compiler (it CHECKS them). Complementary, not competitive — and Flue independently chose
**typed authoring + typed handoffs**, which is exactly vigiles's typed-spec + Supplies/pipe moat.
A second team betting on "the harness is a typed program, not prose" is validation. Flue also adds
a 4th adapter candidate, and because it imports CC `SKILL.md`, vigiles ALREADY partially verifies a
Flue repo (the SKILL.md half) today.

## Poached ideas, ranked by on-moat × novelty

**Sharpest (on-moat, deterministic, linter-impossible):**

- **F1 — Capability-diff across the SUBAGENT INHERITANCE TREE ★.** Flue subagents "inherit model
  - tools from the parent, add their own." So a child's EFFECTIVE capability = parent ∪ own, and
    the **lethal trifecta can straddle the delegation boundary** (parent grants Read+WebFetch, child
    adds Bash → exfil across the edge) — invisible to a per-unit check. Extends the trifecta detector
    I'm shipping now from one unit to the capability UNION over a delegation/inheritance tree. This IS
    the "capability-diff at PR time / blast-radius" moat (#2 of the typed-spec moat) made concrete.
    Applies to CC skill→agent chains too (effective union), not just Flue. NEW, FP-safe-able, nobody
    does it.
- **F2 — Typed tool/workflow I/O handoff verification ★.** Flue tools + workflows carry Valibot
  input/output schemas; a delegation that passes a shape the callee's input schema rejects is a
  runtime Valibot throw. vigiles's pipe()/Supplies does this at COMPILE time — so verify a Flue (or
  CC railway) handoff chain's schemas line up PRE-RUN (the whole positioning: pre-run > runtime
  throw). Flue choosing typed I/O is the market signal the typed-composition moat is real.
- **F3 — Model-specifier resolution (provider/model) ★.** Flue/Codex/multi-provider use
  `provider/model` ids. Generalize vigiles's existing close-typo `model:` check to verify a
  `provider/model` specifier resolves to a real, non-deprecated model across providers — a typo'd or
  retired model is a silent failure. One detector, extends the frontmatter-value rule.

**New SURFACES (the user invited these — "new ones are interesting too"):**

- **F4 — Workflows as a first-class audit surface.** vigiles audits skills/agents/hooks/MCP/commands
  but not WORKFLOWS, which Flue (and LangGraph/CrewAI/Agent SDK) make central. We already have
  `validateRailway` (unknown delegate target, empty railway, bounded recovery) — PRODUCTIZE it as a
  `workflow` audit surface: input/output schema present, every step handoff lines up (F2), every
  delegate resolves, no dead branch. Maps to Flue `defineWorkflow` AND our own railway().
- **F5 — Tool DEFINITIONS as a surface.** vigiles checks a subagent's tool CONTRACT (which tools it
  may use) but not tool DEFINITIONS. Flue makes `defineTool` first-class + typed. New surface: a
  tool's I/O schema is well-formed, its run-handler effects match its declared permission/effect
  floor (the effect-surface moat applied to a tool body), names don't collide.
- **F6 — Harness-portability lint ("write once, deploy anywhere").** Flue's pitch is portability;
  vigiles's CLAUDE.md⇄AGENTS.md mirror + skillFrontmatter profiles are the verification analog. Flag
  a skill/agent relying on a harness-ONLY frontmatter key (inert under another targeted harness) when
  a repo targets several — "this won't behave the same on Codex/Flue."

**Adapter / strategic:**

- **F7 — A `vigiles/flue` adapter (4th harness).** 5 ports; code-module (shellHooks:false, like
  OpenCode). Low-hanging FIRST STEP: detect `flue.config.ts` and verify the SKILL.md dirs it imports
  - `agents/*.ts` model specifiers + MCP — vigiles already does the SKILL.md half. The TS-defined
    skills/tools need AST parsing (not frontmatter) — the bigger lift.
- **F8 — Workflow event-history as a Trace source (test tier).** Flue workflows expose
  `runId` + `client.runs.events(runId)` — a deterministic event history. vigiles's Trace check
  vocabulary could ASSERT over a Flue run's events (new transport, same checks). Confirms the
  observability bridge (OTel-GenAI spans from the test tiers, runtime-guardrails-observability.md).

**Confirmations (not new, but Flue validates direction):** typed-as-source-of-truth (the whole
spec→compile thesis), the sandbox/confinement direction (Flue ships a Sandbox API), OTel/Braintrust
observability demand.

**Top pick to build:** **F1 (capability-diff across the inheritance/delegation tree)** — it's the
direct next increment on the trifecta work in flight, deterministic, linter-impossible, and it's the
blast-radius moat made shippable. F3 (model-specifier) is the cheapest quick win.
