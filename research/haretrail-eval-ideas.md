---
status: idea
topic: audit
---

# haretrail-driven audit + eval ideas (2026-07-01)

Captured from a deep dogfood of `vigiles audit` on `fleytman/haretrail` (a Codex
skills repo: root `AGENTS.md` + 11 prose skills, each with `references/workflow.md`

- `../_shared/system-behavior.md`; 7 have a Codex `agents/openai.yaml`; a
  `scripts/triggers/en.json` **trigger manifest**; shell installers; **no hooks, no
  CC subagents, no MCP, no specs**). audit graded it A-100 and only flagged the (now
  REMOVED) Cyrillic-description finding — which prompted asking what audit _could_
  find. These are the ideas, not yet built.

## New DETERMINISTIC audit/lint checks (the cross-reference moat on surfaces we don't parse yet)

All high-precision, model-free, and the same "verify a reference resolves" engine
vigiles already ships — just pointed at surfaces it currently ignores:

1. **`agents/openai.yaml` cross-validation** (Codex per-skill agent config). vigiles
   reads it **not at all** today. On haretrail: 7 skills have a **Russian**
   `openai.yaml` while their `SKILL.md` description is **English** — a cross-surface
   language mismatch; and `default_prompt` references `$research` (a skill) that
   should resolve. Concrete latent finding.
2. **Trigger-manifest ↔ skill-folder cross-ref.** `triggers/en.json` literally
   declares "keys must match the skill folder names under `skills/`." A renamed
   skill / typo'd key = a dead trigger phrase or an orphan. (Clean on haretrail —
   11 keys = 11 folders — but the CHECK is real.)
3. **Env-var config contract.** 15 `HARETRAIL_*` vars across skills + scripts;
   `HARETRAIL_ARTIFACT_LANG` / `HARETRAIL_CONFIG_DIR` are read but not obviously set
   → silent fallback. Reference-verification applied to config vars.
4. **Cross-skill delegation ref.** A `SKILL.md` body naming another skill
   (`"apply the summary logic"`, `$research`) → that skill must exist. (Today vigiles
   checks tool/MCP refs, not skill→skill.)

## New EVAL helpers (the behavioral axis — and haretrail ships its own fixtures)

Recall on haretrail was already **measured + healthy** (Finding 3a). The OPEN,
never-measured question is **precision / selection collision** across the
overlapping "record-work" cluster (daily/retro/debrief/contribution-log/
work-evidence/summary/lessons/postmortem) — Finding 3b was blocked by a usage limit.
`triggers/en.json` hands us the recall prompt set per skill for free.

1. **`measureSelectionMatrix` — the N×N confusion matrix for skill SELECTION, as a
   first-class assertable primitive** (`assertNoCollision({ maxOffDiagonal })`).
   Feed every skill's prompts to the whole installed set → which skill actually
   fired. Diagonal = recall; off-diagonal = "skill X's prompt fired skill Y." Today
   this lives buried in `scan-behavioral.ts` under the `audit.measure` consent;
   promote it. **"Confusion matrix for your router" — no competitor ships it**, and
   it's exactly what haretrail's cluster needs. THE thing to build first.
2. **`deriveTriggerSetFromManifest` — zero-authoring fixtures + free negatives.**
   Ingest a trigger manifest (`triggers/en.json` shape), or derive prompts from each
   description (`audit-prompts.ts` already does). The trick: **each skill's positives
   are every other skill's negatives** → precision/false-positive-rate for free, no
   hand-authored `irrelevantPrompts`. Generalizes to any plugin with described skills.
3. **`measureTriggerRate({ locales: ['en','ru'] })` — a cross-lingual axis.**
   Recall per language, side by side (formalizes the hand-run Finding 3a). Useful for
   any multilingual plugin. NB the deterministic Cyrillic _flag_ was removed (refuted),
   but this _measurement_ helper still has value on request.
4. **`measureDescriptionAblation` — does the description earn its length?** A/B full
   description vs first-sentence-only → recall delta. The _measured_ payoff of the
   `skill-description-budget` warn rule. Rides the existing `runEval`/`measureArms` A/B.
5. **`withPluginFixture` — the plugin seeds its own behavioral test.** Materialize the
   plugin's own `templates/` + `examples/fixture-data-repo/` as ground truth for the
   apex "does `daily` actually produce its 4-section standup?" eval. Opportunistic —
   most plugins don't ship fixtures, so nice-if-present, not general.

## Honest framing

- On a content-only skills repo, the deterministic _test_ tier (runHook / tool-contract)
  has ~nothing to bite (no hooks/subagents) — the value is **behavioral**.
- Only **prompts-derived-from-descriptions** generalize to every plugin; the manifest
  (#2's freebie) and fixtures (#5) are haretrail bonuses.
- Prior art exists for "does a skill fire + precision" (AWS skill-eval; promptfoo can
  be rigged); the **unclaimed** combination is the whole-set confusion matrix +
  auto-sibling-negatives + run on the real installed harness on your subscription.

See also: `research/plugin-behavioral-findings.md` (Findings 3a/3b — the haretrail
probe + the cross-language refutation), `research/audit-wow-ideas.md`.
