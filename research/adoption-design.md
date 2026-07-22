---
status: active
topic: positioning
---

# Adoption design — the buildable spec

HOW we hit the adoption goals. The WHAT/WHY north star is `adoption-goals.md` (read it
first); the per-team cases are `adoption-personas.md`; the verb model is
`cli-command-model.md`. This is the implementation plan — each item names the goal it
serves, the file-level mechanics, and the ethical guardrail. The ethical-sharing
mechanics are grounded in a 2026-07 research pass on viral-loop patterns + backlash
incidents (Lighthouse/PageSpeed, Socket, OpenSSF Scorecard, README-badge studies;
anti-patterns: LinkedIn contact-spam $13M settlement, FB frictionless sharing, Path
address-book, Duolingo guilt-streaks, GitHub's move away from public "name & shame").

## Build items (priority order)

### 1. `init` gate-only + non-evil spec nudge → G1, G2 — **PARTIALLY SHIPPED**

**Why:** existing-harness / non-JS teams want the integrity GATE, not the plugin+spec
SETUP (`adoption-personas.md` case 3). Full `init` is friction/conflict for them.

**SHIPPED (no new CLI surface — honors the no-flag bar):** `SetupPlan.scaffoldSpecs`
(`src/setup-plan.ts`) decouples the lint GATE (structural rules on raw files + CI +
devDep, all written outside `setupPillar1`) from the SPEC SCAFFOLD (`setupPillar1`,
now gated on `plan.scaffoldSpecs`). `scaffoldSpecs` tracks the lint pillar by default
(so bare `init` / `--lint` / `--no-plugin` are UNCHANGED — no test breakage, no
default flip), and the wizard's NEW FIRST QUESTION is the fork: **"gate" → a pure
lint gate (no plugin, no test, no spec) · "full" → specs + skills + hooks**. The
non-evil invitation is `gateOnlyInvitation(plan)` — a pure one-liner printed after a
pure-gate setup ("run `init` and choose 'full' … optional, the gate already works");
INFORMATIONAL, never a second prompt (the wizard already asked; a headless run never
hangs). Unit-tested in `setup-plan.test.ts`.

**SHIPPED — the non-interactive gate is `--gate`.** `init --gate` is the headless
equal of the wizard's "gate" choice: `resolvePlan` maps it to
`{lint:true, test:false, plugin:false, scaffoldSpecs:false, strict:false}` (the lint
gate plus CI plus the devDep, nothing installed), and `shouldPrompt` treats it as a
settled choice so it never prompts. Unit-tested in `setup-plan.test.ts`; documented in
`docs/cli.md`.

**Why `--gate` (opt-in), NOT a default-flip — the decision + reasoning (2026-07-22).**
The options were: (A) a `--gate` flag, full stays the default; (B) flip the
non-interactive default to gate-only, specs behind `--strict`; (C) `--lint
--no-scaffold`; (D) a `setup.mode` config key; (E) auto-detect gate when the repo
"looks" gate-appropriate. **Chose A.** The founder's sharp question was: doesn't making
the gate opt-in REDUCE adoption of the richer features (specs/skills/evals)? The answer
is the reverse — **A keeps full as the default, so the richer layers are what a human
gets by default; only B would bury them behind a flag nobody types.** So B is the option
the concern actually rules out. The deeper principle, which is the real record here:
richer-feature adoption does NOT come from the install DEFAULT — a real existing-harness
team proved that FORCING specs at `init` was friction that _hurt_ first adoption (the
symmetric failure to hiding them behind a flag). Both "force at install" and "hide behind
opt-in" starve the richer layers. The escape is **discovery-through-use**: the audit
report shows what a spec/eval would catch in YOUR repo (the adoptability preview), the
honest `Tested`/`rules→enforced` teases say "run locally to see X", the model-invocable
skills (`strengthen`/`edit-spec`/`test-harness`) fire on the matching prompt, and the
report's "create spec" buttons turn a finding into one click. So the gate is the
low-friction floor everyone reaches; the richer layers are pulled in by a compelling
INVITATION, not a forced default. The corollary to hold onto: the growth risk isn't
"gate is opt-in", it's **a weak invitation** — so keep the in-report "what a spec/eval
would catch" tease strong (that's where richer-feature adoption is actually won), and
never let the (now-dismissible, item 2/1b) nudge be the ONLY invite. Rejected: B
(breaking + surprising + the exact thing the concern rules out), E (magic — violates the
explicit-over-magic ethos the install rules stand on), C (two flags to say "gate", less
discoverable than one), D (chicken-and-egg — `init` is what creates the config).

**FOLLOW-UP:** the "gently later" nudge is now DISMISSIBLE (item 2/1b — a `.vigilesrc.json`
`nudge:"dismissed"` flag suppresses the adoption invitation; the invite states the one-key
dismiss inline). A time-delayed "remind me on the Nth run" is still unbuilt (and would need
`init` or a hook to write state, since `audit`/`lint` are pure reads).
**Ethical guard (non-negotiables 1–2):** declining is one keystroke, no grade penalty,
agent/CI/piped never hangs (the invitation is a print, not a prompt).

### 2. `Tested` + `rules → enforced` HONESTY → G3

**Why:** `Tested` reads as a failing alarm though it's advisory and counts only
vigiles-native `.eval.mjs`/`.harness.mjs`; `rules → enforced` is silent on non-JS/Py
yet the site features it. Both make a team feel the tool doesn't fit / lies.
**How:** (a) `Tested` — detect the repo's own test signal (a `package.json` `test`
script, a test dir, a CI test step) and either credit it or null the ring; re-word so
it's unmistakably "N surfaces have a vigiles test/eval", never a red "55/100". (b)
`rules → enforced` — gate on `detectedLinters` (rule-inventory): none → render
"references + structure verified; rule-enforcement needs ESLint/Ruff/Pylint/Clippy"
instead of the universal `eqeqeq` example (also on the site's `CliRulesRow` — note the
supported stacks). **Guard (non-negotiable 3):** never over-promise / measure the wrong
thing; honesty over a flattering-but-false signal. Ties to the transparent-methodology
mechanic — each ring should link to "what this measures / doesn't / reproduce locally".

### 3. Non-interactive `audit` output → G4, G5

**Why:** Lighthouse always emits the report file; a bare all-A leaderboard with no
action points reads as "found nothing" (`adoption-personas.md` case 5).
**How:** `audit` always writes `vigiles-report.html` + prints its path (a `--out`
override); the leaderboard (`src/leaderboard.ts` `formatLeaderboard`) gains the worst
finding per plugin + a per-plugin report link + a "N plugins detected → leaderboard
mode" header. **Guard:** stays a pure read (non-negotiable 1) — writes only the report
file it's asked to emit, nothing in the audited tree.

### 4. LOCAL-RESULT SHARE loop → G4

**Why:** a graded result spreads only if it's shareable; today only the WEB demo shares
(via `?repo=` deep-link), a local CLI result doesn't. Backlash research is unanimous: a
share must be a deliberate act on a standalone-useful artifact, never auto/coerced.
**How (three tiers, all opt-in, value-first):**

- **(a) Public-remote deep-link — SHIPPED (zero backend):** `audit` reads the audited
  repo's `origin` remote (offline, best-effort) and, for a GitHub repo, prints
  `Share this grade → https://vigiles.sh/?repo=owner/repo` — reuses the demo deep-link,
  which re-runs live for the recipient. No upload, no new infra, no new CLI surface (a
  line on the existing `audit` output). Pure parse in `src/share-link.ts`
  (`parseGitHubRemote`/`shareLinkForRemote`, unit-tested for the https/scp/ssh shapes);
  the git read is a thin `readOriginRemote` in `cli.ts`. We can't verify public/private
  offline and deliberately don't (audit stays network-free) — the line is captioned
  "public repos … no upload", honest about the requirement. Non-evil: a suggestion,
  never an auto-share, only on the human (`!json`) path.
- **(b) OG/social-card preview on the SHARED LINK** (corrected 2026-07-22 — the earlier
  "bake into the single-file report" was wrong): an OG card is rendered by a crawler that
  FETCHES a URL and reads STATIC `<head>` meta — no JS, no `file://`. So an image baked
  into the local `vigiles-report.html` on disk is NEVER crawled; the card belongs on the
  HOSTED `vigiles.sh/?repo=` deep-link (4a), a SITE change, not a report change. It fixes
  "shared via screenshot" — the exact gap that made a third party build page-speed.dev
  over Google's own tool. Two tiers: **(b1) GENERIC branded card** — one static image +
  fixed `<meta>` on the Pages site, ZERO infra, ships now, so every 4a link previews as a
  vigiles card (but not the viewer's actual grade); **(b2) PER-GRADE card**
  (`owner/repo · F · rings`) — needs a SERVERLESS OG endpoint (Vercel OG / Satori render
  SVG→PNG per `?repo=`), because GitHub Pages is static and can't vary `<meta>` by query
  string (crawlers don't run JS to rewrite it). b2 bundles with 4c (both need the backend);
  b1 is the near-term ship.
- **(c) Explicit upload (later, needs the roadmap backend):** a "Copy shareable link"
  ACTION (never automatic), time-boxed (PageSpeed's 30-day model), uploads the
  `AuditReport` JSON only — never source/env/file contents — with a plain pre-upload
  disclosure (same posture as the `audit.measure` consent-once).
  **Guard (non-negotiable 5):** no auto-post, no "share to unlock", no contact access,
  always declinable.

### 5. README badge → G4 (after 1–4)

**How:** ONE dynamic badge (`vigiles: A`, a shields.io-compatible endpoint), always
**maintainer-added** after they run `audit` (never injected by `init` into a file),
linking to the methodology page. **Guard:** do NOT ship a badge kit — npm badge-fatigue
data shows >~5 badges correlates with LOWER perceived credibility on popular repos. One
badge, one link.

### 6. Enrich the GHA sticky PR comment → G4, G5 (the best + safest share surface)

**Why:** the research is unanimous — the CI status check / sticky PR comment (Lighthouse
CI, Socket.dev) is the SINGLE lowest-risk, highest-adoption "share" channel: it's seen
only by the PR's own participants (who already have context), nobody has to _decide_ to
share it, and it never touches a public audience — so it drives adoption with zero
reputational risk. It's already shipped (`action.yml`, sticky-by-marker comment, job
summary, annotations — `prod-grade-gha-cli`), but today it posts the raw `lint`
pass/fail; the GRADE isn't visible where the team actually works.
**How:** enrich the comment CONTENT (not the infra) with the graded summary — the A–F
grade + the four rings + the top fixable findings + a link to the full report — so a
teammate opening the PR sees the harness's health at a glance. Keep it the SAME sticky
comment (found-by-marker, updated-in-place, never a new comment per run). Optionally a
grade-delta vs the base branch ("Structure B→A this PR"), the give-value-at-the-good-
moment mechanic. **Guard:** scoped to the PR (non-negotiable 4/5) — no public exposure,
best-effort on a fork without write access (degrade to the job summary, never fail).

## Reputation-safe grading (the public leaderboard/demo — highest-risk surface) → G4, non-negotiable 4

Featuring real repos' (sometimes low) grades is the biggest reputational risk. The rules,
from how OpenSSF Scorecard / Socket / GitHub earned trust while grading others:

1. **Publish the methodology before any public score** — what's measured, what's NOT,
   reproducible locally (Scorecard's candor is what defuses "shame tool").
2. **Grade artifacts, not people** — findings are about a repo's config/refs/structure,
   never a maintainer's competence; no "so-and-so's plugin is broken" copy anywhere.
3. **Every finding fixable, inline** — a score without a next action reads as judgment.
4. **Label confidence** — decidable fact (broken ref) vs judgment (vague description),
   using the existing `rule-meta` buckets.
5. **Private-first for real defects** — a `lethalTrifecta`/leaking-hook finding follows
   GitHub's move away from public name-and-shame; judge the RESPONSE, not the flaw.
6. **Only feature MIT-or-opted-in repos** — REUSE the existing `dogfood-vendoring-policy`
   (MIT-only, SHA-pinned, provenance-documented) as the SOURCING rule for anything shown
   publicly; it already IS the reputation-safe pattern, just apply it to the public
   leaderboard, not only internal fixtures.
7. **Sort, don't editorialize** — a plain `repo · score · top fix` table, never a "hall
   of shame" headline.
8. **Fast free re-score** — the moment a maintainer can fix-and-refresh, the tool stops
   feeling adversarial and becomes a to-do list.
9. **No surveillance-scale scraping** — periodic public benchmarks are fine; a live
   "we're watching you" dashboard is not.

NOTE (current demo, PR #106): davila7 is featured at F — findings ARE objective +
one-line-fixable (per rule 3–4) and the framing is "worth fixing" (rule 7 OK), but it
is NOT MIT-vendored/opted-in per rule 6. Reconcile when the leaderboard hardens: prefer
the `?repo=` LIVE grade (the maintainer's own public code, graded on demand, always
re-scorable) over a baked low grade, or apply the vendoring policy.

## Deferred / lower priority

- **"Wrapped"-style local recap** (G4) — opt-in periodic "harness health, N months in"
  (score trend, rules promoted, findings fixed); narrative delight, NO streak/guilt
  mechanic; the user's own repo so zero third-party exposure. Post install-base.
- **Percentile-in-report** (G3/G4) — "your Structure beats 70% of scanned plugins" from
  the aggregate corpus; never names/ranks specific repos to the viewer. Needs corpus scale.

## Build sequence

1 (init gate-only + nudge) → 6 (PR-comment grade — quick, already-shipped infra, the
best+safest share surface) → 2 (Tested/rules honesty) → 3 (audit output) → 4a (public
deep-link) → 4b (OG image) → 5 (badge). 4c/Wrapped/percentile gated on the backend +
corpus. Each ships behind the `adoption-goals.md` non-negotiables; the public-grading
checklist is a hard gate on anything that features a repo vigiles doesn't own.
