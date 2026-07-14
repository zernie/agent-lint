---
status: active
topic: roadmap
---

# Pre-release focus — what to park / polish / add before the HN launch

> The consolidation doc the rest of the research feeds into. vigiles has real
> feature SCATTER; a public launch needs ONE coherent product with a small, frozen
> surface. This is the single "what actually ships" lens — the roadmap's
> `🚀 Launch readiness` section points here. Written 2026-06-24.

## The focusing thesis (everything triages against this)

**One product story: "Verify + measure your agent harness — deterministic and free
where it can be, on your own subscription where it can't."** Two pillars survive as
the public product; everything else is supporting infra, parked depth, or polish:

- **VERIFY** — the cross-reference engine (`lint` / `audit`): free, instant,
  deterministic. The credible backbone.
- **MEASURE** — the harness-testing tiers + trigger-rate + the ecosystem benchmark
  (`test` / `eval` / the `audit` trigger tier): the interesting, fundable, on-the-sub story.

The launch is **article-led** (measurement at scale — "what actually works"), repo as
the destination. The pitch: the **deterministic shift-left guardrail + private,
on-your-sub measurement.**

**The triage test for every feature:** does a launch user touch it via the CLI in
service of VERIFY or MEASURE? → polish + freeze. Is it depth they discover later? →
keep working, un-headline, don't freeze. Is it experimental / half-built / diluting? →
**park** (un-export, hide from docs).

## Park / polish / add — the whole surface

| Cluster                                                                                                               | Call                        | Why                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| `lint` cross-ref engine (7 catalogs, refs, marks)                                                                     | **POLISH + FREEZE**         | The VERIFY backbone; the credible free wedge                                |
| `audit` (Lighthouse: rings + fixes + HTML; battery/MCP/trigger interactive) + leaderboard                             | **POLISH + FREEZE**         | Free report + the viral hook                                                |
| `test` / `eval` tiers (`runHook`/`runHarnessTest`/`runEval`/`measureTriggerRate`/`measure`)                           | **POLISH + FREEZE**         | The MEASURE story; the public testing API                                   |
| `init` + GitHub Action + the 8 CLI verbs + exit codes                                                                 | **POLISH + FREEZE**         | Delivery surface; what 90% of launch users touch                            |
| `compile` (spec→markdown) + `generate types/schema`                                                                   | **POLISH (basic) + FREEZE** | The authoring loop under VERIFY                                             |
| Codex adapter (`vigiles/codex`)                                                                                       | **KEEP (light-headline)**   | Real differentiator ("CC AND Codex"); stable; demo on CC                    |
| **Markdown mode** (inline `<!-- vigiles:enforce -->`)                                                                 | **KEEP, DEMOTE**            | The zero-TS on-ramp the README depends on — see below                       |
| Frontmatter mode (Level 1 `vigiles:` block)                                                                           | **CANDIDATE CUT**           | Redundant 2nd markdown syntax → collapse the ladder (below)                 |
| Sandboxing / egress (`sandbox.ts`/`egress.ts`)                                                                        | **KEEP-QUIET**              | Supports the eval-safety story; don't headline                              |
| `vigiles/adapter` authoring kit                                                                                       | **KEEP-QUIET**              | Niche; real but not a launch headline                                       |
| Compiled hooks / Guard (`vigiles/hook`)                                                                               | **PARK**                    | Niche + #34692 caveat; already pulled from the README                       |
| Deep typed-spec moat (typed composition `pipe`/`Supplies`, `generate harness`, capability lattice, `capability-diff`) | **PARK (un-headline)**      | The "discover later" depth; keep working, NOT in the launch story           |
| `guards.ts`, `hook-spec.ts`                                                                                           | **PARK (un-export)**        | Experimental spikes; hook-spec is imported nowhere                          |
| `effect()` / effect-region                                                                                            | **PARK (un-export/hide)**   | Parked P3, model-emitted boundary is fragile                                |
| `evolve.ts` self-evolving specs                                                                                       | **PARK (internal)**         | Research-y; keep `proofs.ts` (used by ncd/covering-array), shelve evolution |
| OpenCode adapter                                                                                                      | **STAY PARKED**             | Already internal/unregistered                                               |

**ADD before release (small by design — the launch blockers, from the roadmap):**

1. **Ecosystem-benchmark v0** — measure ~10–20 hyped skills on `bench/corpus`. The
   launch artifact. (THE one real build.)
2. **First-run hardening + top-10-plugin FP sweep** — `npx vigiles@latest` from a clean
   dir + a real repo; kill any cry-wolf on a famous plugin.
3. **API surface freeze + `STABILITY` statement** (below).
4. **The article + README 60-sec proof + GIF.**

**ADD after launch (the tech-poach backlog — NOT pre-release):** see next section.

## Tech findings to feed the roadmap (extracted from the competitor/VC research)

These are the POACHABLE TECH ideas, pulled out of the competitor/VC research (the
private `startup/` vault) so they're not lost — all **post-launch**, ranked:

1. **Stateful record-replay twin (HIGH, extends the PATH-shim).** Record a real session
   trace, replay in order → a local stateful twin for multi-step SaaS flows. Multiple
   funded competitors productized record-replay → demand proven. SaaS-HTTP/MCP only;
   DB/Redis stay R3 (run-real-disposable). The one "twin" that's easy for us (we record,
   not hand-author). → roadmap PATH-shim item.
2. **Capability-diff / blast-radius PR comment (P1, v0 shipped).** "This PR widened the
   agent's powers." The bridge bet; the investor-validated "type-safety guardrail"
   framing in product form. Richer per-step effect-row engine (M1) is the follow-up.
3. **Covering-array "simulation at scale" (MED).** A funded competitor's "simulate
   thousands of scenarios" framing = our covering-array over the typed config space
   (3072→18). Same fundable capability, cheaper. → `covering-arrays-for-harness.md`.
4. **Trace-on-block UX (LOW).** Don't just deny — return the reasoned trace.
5. **Twin-contract verification (MED/Explore).** "Does your mock still match the real
   API's current spec?" — the cross-ref engine applied to twins; gate on demand.
6. **AI-authored + self-healing tests + root-cause triage.** Our
   `scaffold-test` (write the test) + `score-explainer` (root-cause + fix) are the
   analogs; lean into "vigiles writes & maintains your harness tests and tells you WHY
   one failed." Polish these post-launch.

## The markdown-mode decision (you asked directly)

**Keep the on-ramp, kill the conceptual scatter.** Markdown mode is two things bundled:

- **Inline comments (Level 0)** — the zero-TS on-ramp that makes "works on any
  CLAUDE.md, no TypeScript" TRUE. The README hero depends on it; it widens the funnel
  with ~zero maintenance. **KEEP.**
- **Frontmatter mode (Level 1)** — a SECOND markdown syntax for the same job. This is
  exactly the kind of scatter to cut: two ways to do one thing is conceptual overhead.
  **Candidate cut** — collapse the ladder from **three rungs (inline / frontmatter /
  spec) to two (plain markdown → typed spec).** Keep the code if removing it is risky,
  but stop documenting/marketing it.

Net: don't kill markdown mode — kill the **"Level 0/1/2 ladder"** framing. Market ONE
on-ramp ("lint works on plain markdown; add a typed spec when you want enforcement").

**UPDATE (2026-06-28) — frontmatter mode is now DISABLED, not just un-marketed.**
The "kept but un-marketed" state proved to be a real smell: a mode that _works_ but
isn't documented silently muddies the spec-first story (it confused a code review —
"why does lint still act on `vigiles:` frontmatter if we dropped it?"). Since vigiles
has ~no users, the cost of fully turning it off is ~nil, so lint now GATES it behind
`FRONTMATTER_MODE_ENABLED = false` (`src/cli.ts`): a `vigiles:` block is **inert** —
not read, not verified, never fails a build. The code is KEPT (`src/core/frontmatter.ts`,
`verifyFrontmatterRules`, `vigiles generate schema`) so the decision is one-line
reversible (flip the flag), but lint's behavior is now coherent with the two-on-ramp
story: **verify compiled output + inline `<!-- vigiles:enforce -->` marks + typed
specs — nothing else.** Inline mode (Level 0) stays fully active. Tests assert the
inert behavior (`src/cli.test.ts`, the "frontmatter mode is DISABLED" describe).

## Locking the API surface (the "stop breaking things" plan)

The fix isn't "freeze everything" — it's **shrink the public surface to the stable
core and launch on the CLI**, which is a narrower, stabler contract than the library.

1. **Audit with `api-extractor`** (`api-surface/*.api.md` already tracks the surface). Sort every
   export into PUBLIC vs INTERNAL.
2. **PUBLIC (frozen):** the 8 CLI verbs + flags + exit codes; `vigiles/spec` (core
   builders), `vigiles/testing`, `vigiles/unit`, `vigiles/claude-code`, `vigiles/codex`,
   `vigiles/adapter`. (`vigiles/hook` stays exported but un-headlined — parked, not removed.)
3. **INTERNAL (un-export or `@internal`):** `guards`, `hook-spec`, `effect()`/effect-region,
   `evolve`, and the deep experimental typed-spec builders. A later breaking change to
   these then burns nobody.
4. **Ship a `STABILITY` statement** (README section + a short doc): _"0.x — the CLI is
   stable; the library API is 0.x and may change; experimental surfaces are marked."_
   Honest beats a fake 1.0; pre-1.0 semver lets the deep stuff keep moving.
5. **Freeze the CLI verbs** — a rename is BREAKING (the `self-command-refs` gate already
   protects emitted-command contracts). No more verb churn after the freeze.

## Positioning lock

- **Consumer one-liner (README hero):** lead straight into the pain — _"You installed a
  bunch of plugins and wrote a few skills — but do they actually work? It's a library with
  no tests."_ → vigiles verifies + measures the harness your agent runs on. (The earlier
  _"100x coder, 1x verifier"_ line is kept as a backup hook.)
- **Category line:** the **deterministic shift-left guardrail + private measurement for
  your agent harness.**
- **THE GATEWAY SHARPENING (2026-06-26, from CC-user feedback + the competitive sweep —
  see `harness-checkup-and-lanes.md`):** `audit` is the ONE simple front door (the iPhone
  principle — NO second subcommand, NO env to configure) that runs BOTH the
  cross-reference LINT _and_ canned TESTS (the disaster-battery "does your safety hook
  actually block?", skill over-fire) and prints a score. The SIDEWAYS move past agnix:
  markdown-linting is crowded + low-demand, so we do NOT compete on rule-count — we
  compete on **"we RUN your harness, not just read it."** Authored tests/evals + the
  `vigiles/testing` API are the DEPTH for those who want more (the funnel, not a second
  product). The competitive sweep confirmed: the score surface is commoditizing
  (agnix ~250–300★ lint leader, AgentLinter the scorecard-UX leader), but
  cross-reference correctness + the testing layer is unclaimed by everyone — that
  intersection IS the wedge, so `audit` must lead with the canned-TEST finding
  ("blocks 2/7"), not the score.
- **The differentiator (author-time vs runtime — THE one-line wedge):** every other
  player catches drift at **runtime, after the fact** (observability / post-hoc) or lints
  **structure**; vigiles proves the references are real and the spec compiles **before the
  agent ever runs** — author-time, deterministic, pre-run. Public-safe phrasing (no
  competitor names): _"verify the harness before it runs, not after, in production."_ This
  is the empty lane; lead the article + README with it.
- **What we are NOT — don't fight for the linting crown (decided 2026-06-25).** vigiles is
  NOT a markdown / structure linter. That lane is crowded + commoditized (the OSS leader is
  well ahead) and "lint-my-markdown" adoption is weak — not worth contesting on its axis. We
  do something DIFFERENT and bold: author-time TYPED SPECS the agent writes (+ EJECT anytime)
  and EVALS you can afford. Reframe Lint as _"your spec's references are real,"_ never "lint
  my markdown" — reference verification is the floor under the spec, not the product.
- **Spec-first; markdown is the FLOOR / eject-target, not the on-ramp.** Adoption is
  frictionless for the two reasons that normally sink a typed-spec product: (1) CC WRITES the
  spec (`edit-spec` / `adopt-spec` / `strengthen`), so "I don't want to write TypeScript" is
  moot; (2) you can EJECT to plain owned markdown anytime (the create-react-app move —
  managed but ejectable), so "lock-in / permanent build step" is moot. The ladder INVERTS:
  spec-first (agent-authored, faithful-to-original by default), markdown = the safety valve.
  This also collapses the earlier choice-anxiety worry to ONE path. ENABLER (must ship for
  the claim to be true): a one-command **`vigiles eject`** — strip the `vigiles:sha256`
  integrity header → clean markdown lint won't nag about; NONE exists today (hand-deleting
  the spec makes `require-instructions-spec` error, `cli.ts:679`).
- **Citeable authorities (ride the now-canon "harness engineering" frame):** Karpathy —
  _"LLMs can automate what you can verify"_; OpenAI — _"the harness is hard"_; arXiv AHE's
  **structure-beats-prose** ablation = the proof that `enforce()` > `guidance()`. Use these
  in the launch article; keep competitor + VC names OUT (they live in the `startup/` vault).
- **The analogy (pick ONE):** lead with **"a test suite + CI for your CLAUDE.md, hooks &
  skills"** (concrete, matches the MEASURE wedge); keep **"TypeScript's `strict` mode for
  your harness"** as the depth/graduated-adoption analogy (the type-safety-guardrail
  hook investors respond to).
- **The HN/article framing:** lead with the MEASUREMENT (_"I measured N hyped skills'
  claims — here's what's real"_), method-first at scale, repo as the destination. NOT
  "lint my CLAUDE.md," NOT the caveman debunk as headline (saturated).
- **Keep internal** (never public): "moat", "measurement authority", "flywheel" — name
  the user benefit instead (per `public-vs-internal-docs`).

## The launch sequence (wtf to do, in order)

1. **Freeze the surface** — api-extractor audit → un-export the experimental cluster →
   write `STABILITY` → lock the 8 verbs. _(Removes the breaking-change churn.)_
2. **Harden first-run** — clean-install smoke test + top-10-plugin FP sweep.
3. **Build ecosystem-benchmark v0** — the one real pre-launch build (the article's spine).
4. **Write the method-first article** + the README 60-sec proof + GIF.
5. **Launch** — Show HN points at the article; repo is the "run it yourself, free" CTA.
6. **Then** (post-launch flywheel): the public leaderboard/badge, the tech-poach backlog
   (record-replay twin, capability-diff M1), un-park Guard. **Moratorium on net-new
   research + new instruments until after launch.**

## See also

- The private `startup/` vault (git-crypt) — the investor/competitor/funding research
  this triage draws on.
- `roadmap.md` — `🚀 Launch readiness` points here; the durable Now/Next/Later map.
