---
status: design
topic: compiler
updated: 2026-07-14
---

# The rule-compiler, end to end — prose rule → enforced, at scale

> Whole-flow design (2026-07-14). Supersedes the stage-at-a-time view. Ties together
> the pieces already built (`src/rule-inventory.ts`, `rule-compiler/extract-existing.js`,
> `rule-compiler/gate.js`, `rule-compiler/catalog/rule-map.json`) into one pipeline, and fixes the
> two decisions that were open: how existing violations are handled, and how the corpus
> is grown. The thesis is unchanged: **NL rules are followed unreliably; compile the
> mechanizable ones to deterministic checks.** The model runs ONCE at compile time; CI
> afterwards is plain ESLint + hooks = $0, deterministic.

## The pipeline (0–6)

### Stage 0 — Harvest (the data flywheel)

Not "run audit on 20 repos and count mappings." **Harvest every prose rule from
hundreds of real `CLAUDE.md` / `AGENTS.md` files and dump them**, so we can analyze in
bulk. Output = a rule corpus we mine for:

- the **distribution** of intents (what people actually write),
- **coverage** — what % route to an existing off-the-shelf rule (plugin index hit-rate),
- the **gap** — common intents we can neither route nor cleanly synthesize (→ the to-do
  list for the plugin index + synthesis templates).

This doubles as a **paper-grade taxonomy** (bigger than the 57-repo census). It's a
flywheel: harvest → analyze → expand index/classifier → re-run → measure lift.

Key efficiency: to harvest RULES we only need the instruction-file TEXT, not the whole
repo. **Fetch the raw `CLAUDE.md`/`AGENTS.md` via the GitHub API — do NOT clone.** Cloning
is only needed later, for a subset, to measure real violations (Stage 4). See the
harvester design below.

### Stage 1 — Segment

Instruction file → atomic candidate rules (one imperative / bullet each). Prose structure
varies wildly, so this is heuristic (bullets, imperative sentences, headed sections) with
an optional model pass in the opt-in tier. Each candidate carries its source span.

### Stage 2 — Classify + reconcile against reality

Each rule is routed, and reconciled against the repo's ACTUAL config via the two tools we
already have:

- `src/rule-inventory.ts` — deterministic, exec-free: does the prose name/intent map to a
  known off-the-shelf rule, and does a textual config grep show it? (Safe on any repo.)
- `rule-compiler/extract-existing.js` — opt-in, exec-based: resolves the repo's REAL enabled
  rules (`eslint --print-config`) + installed plugins, with base↔`@typescript-eslint/`
  variant unification. (Own-repo/consented only — it runs the config.)

Four route classes:

| Class          | Meaning                                         | Action                                                                                                                                                                                                                                                             |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **REUSE**      | maps to an off-the-shelf rule                   | reconcile via `extract-existing`: already-enforced (noop) · installed-but-off/warn (one-line enable) · not-installed (add plugin + enable) · **documented-opt-out** (config says off _on purpose_, e.g. react-spring → surface the CONTRADICTION, never auto-flip) |
| **SYNTHESIZE** | mechanizable but no off-the-shelf rule          | synthesize a custom rule + independent self-test → Stage 3 gate                                                                                                                                                                                                    |
| **HOOK**       | action rule (git push, file edits, shell)       | generate a `PreToolUse` / pre-commit hook, not a lint rule                                                                                                                                                                                                         |
| **SEMANTIC**   | judgment-only ("clear names", "keep it simple") | keep as labeled prose — honestly un-enforceable                                                                                                                                                                                                                    |

### Stage 3 — Synthesize + gate (built: `rule-compiler/gate.js`)

Synthesized rule + independent self-test → two-stage blind gold-set gate. Pass → kept
(safe to enforce). Fail → **abstain** (advisory, never a faked green check). This is the
"84–96% of synthesized checkers silently leak, caught by the gate" finding.

### Stage 4 — Existing violations (DECIDED)

Turning a rule on over an existing codebase lights up existing violations. **Decision:**

1. **Auto-fix the free subset** — `eslint --fix` clears auto-fixable rules in one shot.
2. **Grandfather the rest via ESLint's native bulk suppressions** — `eslint --suppress-all`
   writes a separate **`eslint-suppressions.json`** (ESLint ≥ 9.24, carried into 10;
   location configurable via `--suppressions-location`). Existing violations are
   **tracked, not hidden**; NEW violations fail CI; the baseline can only **ratchet down**
   (`--prune-suppressions` removes entries a touched file has cleaned up). `betterer` is
   the linter-agnostic equivalent if we ever need one.
3. Alternative posture (offer, not default): **changed-files-only** enforcement (lint the
   PR diff; leave untouched old code alone until edited).

**Explicitly REJECTED: grandfathering via `eslint-disable` comments.** That litters the
code and is the exact escape-hatch the companion article roasts (a `/* eslint-disable */`
silences the very checker hunting for it). The compiler must never do that.

So Stage 4 default: **auto-fix free → baseline the rest into `eslint-suppressions.json` →
CI enforces new + ratchets old.**

### Stage 5 — Persist

Write the config change (enable/add rule) + the suppressions baseline + wire CI. For
HOOK-class rules, write the hook (a vigiles compiled hook for safety). Synthesized rules
land as real ESLint rules in the repo. Model ran once at compile time; CI is plain ESLint.

### Stage 6 — Feedback

Abstained syntheses → improve synthesis prompts/templates. Unroutable + unsynthesizable
intents → new plugin-index entries or new hook templates. Feed back to Stage 0.

## Decision log (2026-07-14)

1. **Existing violations → auto-fix free subset + `eslint-suppressions.json` ratchet.**
   Never `eslint-disable`. (Erdni.)
2. **Harvest at scale** — Stage 0 becomes a bulk rule-harvester + taxonomy, not a mapping
   counter. (Erdni.)
3. **Order: fix the compiler FIRST, then harvest.** The harvest's classification quality
   depends on a solid plugin index + classifier + `extract-existing` wiring, so improve
   the compiler before running the bulk harvest over it. (Erdni, 2026-07-14.)

## The harvester (Stage 0) — immediate build

- **Discover** repos with instruction files: GitHub code search (`filename:CLAUDE.md`,
  `filename:AGENTS.md`), seeded by the census corpus. Target a few hundred.
- **Fetch file text only** via the GitHub API (raw contents) — NOT clones. Cheap, fast,
  hundreds feasible.
- **Segment** each file into atomic rules (heuristic first: bullets + imperative lines
  under rule-ish headings; record provenance repo+path+line).
- **Classify** each rule against the plugin index (REUSE / SYNTHESIZE / HOOK / SEMANTIC)
  using the same intent keywords as `rule-inventory` + `catalog/rule-map.json`.
- **Emit** a corpus file (JSONL: {repo, path, ruleText, class, mappedRule?}) + a summary
  (intent histogram, coverage %, top unroutable intents = the gap list).
- **Analyze** the gap list → drives plugin-index expansion + synthesis-template priorities.

Only a SUBSET later needs cloning — to measure real violations of a compiled rule
(Stage 4 demonstrations). Harvest ≠ clone.

## Built vs next

- Built: `rule-inventory` (deterministic classify/reuse-detect, precision-hardened,
  corpus-expanded), `extract-existing` (resolve real enabled rules), `gate.js` (synthesis
  trust), `catalog/rule-map.json` (reuse index — seed; a 129-intent expansion is drafted
  but UNVERIFIED, needs rule-name vetting for fabrications before merge).
- Next, in order (compiler first, then harvest — Erdni 2026-07-14):
  1. **Fix the compiler**: vet + merge the expanded plugin index (the 129-intent draft —
     verify every `existing` rule name is real, no fabrications); wire `extract-existing`
     into a single classify→reconcile step; solidify the classifier.
  2. **Then harvest** the rule corpus at scale over the improved compiler.
  3. The Stage-4 baseline/suppressions writer.
  4. The opt-in `audit` power-tier that runs the whole loop (compile → gate → run →
     baseline → save) on a consented repo.

## Open questions

- Segmentation quality: heuristic vs model — start heuristic, measure, add a model pass
  only where the heuristic misses.
- How to present the CONTRADICTION case (documented-opt-out) so it never reads as a
  false nudge (already handled in `rule-inventory` via `isDocumentedOptOut`; the compiler
  tier should defer to the human, not auto-flip).
