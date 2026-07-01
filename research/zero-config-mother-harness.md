---
status: active
topic: positioning
---

# Zero-config mother harness — "create-agentic-app" done right

> Status: research synthesis (2026-06-19). Can vigiles be the close-to-zero-config,
> batteries-included harness setup (lint + hooks + rulesync + test-gen + top skills) in one
> command — standardrb/create-react-app for agentic coding? Verdict: **yes, but as a
> PERSISTENT verifier, not a scaffolder, and by COMPOSING the bundle, not authoring it.** This
> resolves the mother-harness axis from `positioning-funnel.md` into a concrete, defensible
> shape. Grounded in a 3-cluster sweep (zero-config precedents · the all-in-one ecosystem ·
> the must-have skills).

## The guardrail: be a PERSISTENT TOOL, not a scaffolder (the create-react-app lesson)

create-react-app was **sunset in Feb 2025** because it was a **scaffolder** — a one-shot
generator that ejects files and steps aside. It rots: its deps go stale, its opinions age into
anti-patterns, and it can't reach back into your repo to fix anything. The survivors (Next,
Expo, Ruff, Biome) are **persistent tools** — resident in `devDependencies`, run every commit,
versioned, so a semver bump pulls users forward.

|          | Scaffolder (rots)              | Persistent tool (compounds)       |
| -------- | ------------------------------ | --------------------------------- |
| Examples | create-react-app, Yeoman       | Next, Ruff, Biome, Expo           |
| Shape    | one-shot generate + exit       | stays resident, runs every commit |
| Updates  | none — files are yours, frozen | semver bump pulls users forward   |

**So a `vigiles init` that drops files and exits = CRA = rots.** The on-ramp is the scaffold;
the **product is `vigiles lint` / `scan` / `test` — resident, every commit, semver-updated.**
The bundle gets you started; the resident verify/test loop is what keeps the harness honest
forever. This is the single most important design constraint.

The other precedent lessons (standardrb/Prettier/Ruff/Biome):

- **"We picked the harness stack" — kill the config argument, not the config.** One opinionated
  default (CC dialect + sandbox + sonnet selector + the rule tiers + a curated skill bundle).
  Custom adapters/rules are the escape hatch, **not the on-ramp**.
- **Escape hatches without ejection.** vigiles's level ladder (inline → frontmatter → spec →
  custom adapter) is the anti-CRA-`eject`: each level unlocks power without abandoning the one
  below.
- **Gate the costly tier, not the cheap tier.** `runHook` (no model, no key, ms) is the default
  on-ramp; the real-model `runEval` tier is opt-in and visibly gated. Never make "needs a key"
  the first thing the dev hits.

## The opening: the space is fragmented AND nobody verifies

The all-in-one ecosystem (June 2026):

| Tool                              | ~Stars | Bundles                                                                                             | Config                          |
| --------------------------------- | ------ | --------------------------------------------------------------------------------------------------- | ------------------------------- |
| **obra/superpowers**              | ~233k  | ~14 skills + a SessionStart auto-activator; multi-harness. _Skills only_ — no MCP/settings/commands | near-zero (marketplace install) |
| **oh-my-claudecode**              | ~36k   | 32 subagents + 40 skills + model routing                                                            | zero-config wizard              |
| **davila7/claude-code-templates** | ~28k   | 600 agents / 200 cmds / 55 MCP / 39 hooks — a **picker**, not opinionated                           | low (you choose all)            |
| **SuperClaude**                   | ~23k   | 30 cmds + 20 personas + 8 MCP servers                                                               | moderate (MCP keys)             |
| **awesome-claude-code**           | ~47k   | a **directory**, not an installer                                                                   | n/a                             |

**Two findings that define the wedge:**

1. **No dominant "create-claude-app".** It's 2015-Yeoman: many generators, no winner.
   superpowers is closest to a _standard_ but is deliberately skills-only (no MCP/settings/
   commands). The "full opinionated zero-config baseline" slot is **open**.
2. **None of them VERIFY or TEST what they bundle.** No tool checks a cited linter rule is
   enabled, that a hook script exists, that a subagent's `tools:` resolve, or that the bundled
   skills actually FIRE. Nearest neighbors stop short: agentlint inspects _structure/behavior_
   (knows your CLAUDE.md is _long_, not whether the rule you cited _exists_); cc-plugin-eval
   tests trigger-firing only; Anthropic's `skill-creator` is single-skill. **vigiles's surface
   — cross-reference the bundle's refs + test the assembled harness deterministically — is
   completely unclaimed.**

## The wedge: the all-in-one that VERIFIES + TESTS what it assembles

Don't out-curate superpowers (233k★ — you lose). **Compose it by reference + add the resident
verify/test layer no one else has.** The differentiating demo:

> `vigiles create` → installs the opinionated stack → **and** verifies every reference resolves
> (no broken hooks, no never-available tools, no dead rule IDs) **and** writes a passing
> trigger-rate eval proving the bundled skills actually fire — **and** runs the
> capability/trifecta check on the bundle so none of the skills you just installed can
> exfiltrate your secrets.

That last point is the loop that ties the security moat to the bundle: **vigiles is the _safe_
all-in-one** — the only one that verified the supply chain of skills it installed. Nobody else
closes "install the stack → prove it's wired right, fires, and is safe."

## The opinionated default stack (the standardrb bet)

One `vigiles init`/`create`, non-interactive for agents:

- **Lint** — vigiles's own deterministic cross-ref rules (the verify layer).
- **Gate** — the hooks (refs-hook + tool-contract rail) + the bubblewrap sandbox.
- **Sync** — detect & compose Ruler/rulesync (by reference, the `composeCollisions` redirect).
- **Skills** (installed BY REFERENCE, the safe-default bundle): **Karpathy Guidelines**
  (144k★, pure behavioral, zero side-effects), **Grill Me** (clarify-before-coding),
  **Superpowers** (752k installs), **Webapp Testing** (Anthropic-official), **Context-Mode**.
- **Tests** — auto-generate trigger-rate evals for the bundled skills (the unique bit — only
  vigiles can, it has the eval engine).

### What to bundle (curated, from the skills sweep)

- **Safe by default:** Karpathy · Grill Me · Superpowers · Webapp Testing · Context-Mode.
- **Opt-in flag (`--compression` etc.):** Caveman **lite only** (real whole-session savings are
  ~4–12%, not the "90%" hype, and ultra-mode prose breaks debugging/onboarding) · RTK ·
  Headroom · CBM/CodeGraph (need tuning + re-indexing → power-user, not zero-config).
- **Don't bundle:** stack-specific packs (Vercel/React rules = FP generator on a non-React
  repo) · niche modes (pinchtab, wenyan).

## Risks (and the discipline)

- **Curation race vs superpowers → don't run it.** Compose/install best-of-breed by reference;
  never author 30 skills or vendor them. vigiles wraps + verifies superpowers; it is not "vs"
  superpowers.
- **Scaffolder-rots → stay resident.** The bundle is the on-ramp; lint/scan/test is the
  product. If it ever becomes "drop files and exit," it dies like CRA.
- **Supply-chain/trust of the bundle → vigiles verifies it.** Every bundled skill is a
  dependency + an attack surface; running the trifecta/capability + ref checks on the bundle
  turns that risk into the trust differentiator.
- **Bundle maintenance → curate light.** A short, justified default list + a flag for the rest;
  the marketplace owns breadth.

## How it resolves the positioning fork

`positioning-funnel.md` left an open fork (leaderboard-authority vs mother-harness-as-identity).
This research collapses it: **the mother harness is the DELIVERY vehicle for the verify+test
moat, not a curation identity.** "vigiles wraps + verifies the stack" — not "vigiles is a rival
skill pack." The leaderboard is still the viral wedge, the test framework is still the moat, and
the zero-config bundle is how a hooked user adopts in 60 seconds — _while the resident CLI keeps
the harness honest forever._ The standardrb/CRA lesson is what keeps that bundle from rotting.

## See also

- `positioning-funnel.md` — the moat axes; this sharpens the mother-harness (delivery) axis.
- `harness-state-space.md` — the verify/test bets (trifecta, ref checks, trigger-rate) the
  bundle runs on what it installs.
- `instruction-file-linter-landscape.md` — the competitor map (agentlint/agnix/… verify
  structure, not references).
- `agent-supply-chain-security.md` — the trifecta/capability check applied to the bundle.
- `sync-tool-compatibility.md` — composing Ruler/rulesync rather than reimplementing fan-out.
