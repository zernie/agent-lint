# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.

## RESUME HERE

**Branch `claude/audit-rings-html-report-mh8sf8` — pushed, NO PR yet (founder's call).**
(Separate from PR #51 / `readme-length-review` — that branch's state is not this one's.)

This session started as a README readability pass and became: a README revamp to 5/5,
a new fan-out doc-review skill, a deep-research menu of NEW audit checks, and the FIRST
two of those checks SHIPPED (lethal-trifecta + skill-resource resolution, wired into
audit AND lint). All committed + pushed; gates green.

### What landed this session (in order)

1. **README → 5/5** (commits on this branch): driven by two user-POV persona reviewers
   (skeptical eng + non-expert plugin author), iterated to 5/5 from both. Dropped jargon
   from the tagline; DEFINED "harness" in the first paragraph + "subagent" at first use;
   renamed "three instruments" → "How it works" + made Lint/Test/Eval scannable (moved the
   runHook code block out); deleted the self-grading "we eat what we cook" blockquote;
   reframed Proof 2 off "markdown linter" → "reality, not style". Readability principles
   recorded in the README's top HTML comment.
2. **NEW skill `.claude/skills/review-docs/SKILL.md`** — auto-triggering project skill
   (model-invocable) that FANS OUT one parallel subagent per reader persona (CC newcomer /
   power user / plugin author / skeptic / non-running decision-maker / Codex user), scores
   x/5, synthesizes cross-cutting fixes, with an opt-in iterate-to-N/5 loop. Supersedes the
   explicit-only `dev/skills/audience-check` (left in place; not model-invocable, can retire).
3. **`research/audit-wow-ideas.md`** — 3-stream deep-research fan-out (our vault + real OSS
   failure patterns from GitHub + adjacent-tools gap). VERDICT: the deterministic markdown-
   lint lane is SATURATED (agnix ~432 rules, claudelint 114, CPV 190+, SkillCheck, etc.) —
   don't compete on rule count. Unique wow = (a) lethal-trifecta capability state-check,
   (b) a Safety/blast-radius ring (false-confidence hooks, the disaster battery, observed-
   vs-declared egress), (c) cross-reference-against-reality, (d) the behavioral tier on the
   sub. Every eval vendor (Galileo/Braintrust/promptfoo/DeepEval/Arize…) is runtime/post-hoc
   - per-token; vigiles is the only PRE-RUN verifier. Includes the OWASP-Agentic-Top-10 →
     deterministic-check mapping + a full competitive appendix. Indexed from research/README.md.
4. **SHIPPED audit-wow #1 + #3** (commits `f76502d` detectors, `8bb5280` wiring):
   - `src/core/lethal-trifecta.ts` — flags a subagent/skill whose declared tool SET holds
     all three legs {read private ∧ ingest untrusted ∧ exfiltrate}. Capability SET-
     intersection, NOT a text scan (dodges the ~78%-FP regex tool-poisoning trap). Bash is
     dual-role (A+C); inherits-all/wildcard → advisory, explicit all-three → hard.
   - `src/core/skill-resources.ts` — verifies a SKILL.md body's bundled-resource refs
     (scripts/references/assets) resolve on disk; FP-safe (links + standard bundle dirs only).
   - Wired into BOTH `audit` (scan.ts findings + --json + formatted report) AND `lint`
     (cli.ts `checkLethalTrifecta`/`checkSkillResourceResolves`, severity-gated, GH
     annotations, exit codes) from ONE detector each (one-detector-no-drift). New RulesConfig
     keys `lethal-trifecta` + `skill-resource-resolves`, default `warn` (NUDGE group,
     raisable to error). `docs/rules/{lethal-trifecta,skill-resource-resolves}.md` + matrix
     rows. 8 new scanPlugin tests incl. a non-CC custom-layout case.
   - VERIFIED LIVE: `audit` flags the vendored madappgang `tester` subagent as a real
     trifecta (Bash+Read / WebFetch+WebSearch / Bash+WebFetch). Gates: build ✓, vitest
     **1792 passed** ✓, lint 0 errors ✓, fmt ✓.

### DO NEXT / OPEN DECISIONS

- **SAFETY-RING PROMOTION — PENDING USER YES/NO.** Trifecta currently shows as a FINDING,
  not a ring (audit's 4-ring model untouched; `audit-score.ts` ring math unchanged). I
  deliberately did NOT re-promote a Safety ring (the founder narrowed it 2026-06-27 over
  cross-platform-confinement). BUT the static trifecta check SIDESTEPS that blocker (nothing
  executes) → it's a clean candidate. Re-promoting is what turns the finding into the
  visceral red ring. Awaiting the founder's call.
- **~16 MORE audit ideas** sit in `research/audit-wow-ideas.md` — next candidates: the
  STATIC false-confidence hook audit (block-decision on a non-blocking event #19009, wrong
  JSON field), `.env`-deny-bypass, instruction-vs-config contradiction, claim-vs-measured
  ROI. Build the same way: detector → audit + lint (one-detector-no-drift) → docs + matrix.
- **NO PR opened on this branch.** Stack: README revamp + review-docs skill + audit-wow
  research + the two features. Open one when the founder says go.
- **MODEL AUTH WORKS HERE** (subprocess `claude -p` via OAuth FD) — model-gated evals RUN;
  only **bubblewrap is missing** (egress/confined-hook paths degrade-to-skip). Keep live
  runs small (subscription quota).

### Gotchas

- **`dialect-drift.test.ts` FAILS here** — it asserts the INSTALLED claude-code SDK tool set
  matches the pinned `VALIDATED_CC_VERSION`; this container runs an OLDER CC (drift banner in
  audit output). PRE-EXISTING + UNRELATED to any code change; fails on a clean tree too.
  Fix separately (pin `@anthropic-ai/claude-code` in env or bump the baseline).
- `CLAUDE.md` is COMPILED from `CLAUDE.md.spec.ts` — never hand-edit; edit the spec + recompile.
- **`npm run fmt` reformats `research/`** (huge prettier diff) — use `npx prettier --write
<files>` and stage ONLY your files.
- Commits: **NO session links / NO model IDs** (auto-classifier blocks them).
- `cli.test.ts` / `agent.test.ts` / `spec.test.ts` are **vitest** despite old node:test labels.
- OSS clone is 403 here; codeload tarballs work
  (`curl -sSL codeload.github.com/<o>/<r>/tar.gz/refs/heads/<main>`).

### Decisions of record (don't relitigate)

- **inherit-all is ADVISORY** (subagent with no `tools:` line) — idiomatic, shown not scored.
- **lethal-trifecta + skill-resource-resolves default `warn`** (NUDGE group, raisable to
  error) — don't-cry-wolf rollout; one detector backs both audit + lint.
- **NO Safety ring promoted** (deferred to a founder yes/no) — audit's 4-ring model intact.
- **audit reads / `lint` is the CI gate** — audit findings are risks, not the broken tally.
- Public docs name USER BENEFIT (no `moat`/`flywheel`, no `research/` links). `startup/` LOCKED.

## Don't re-read unless the task needs it

- `research/audit-wow-ideas.md` — the ranked menu of new audit checks + competitive appendix.
- `research/roadmap.md` — `🚀 Launch readiness`. `startup/` — git-crypt vault (LOCKED).
