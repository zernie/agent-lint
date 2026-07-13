# @vigiles/compiler

The opt-in **rule-compiler** tier of vigiles. It turns a natural-language agent
rule (from a `CLAUDE.md` / `AGENTS.md`) into a self-tested lint rule, and — this
is the point — **refuses to ship a checker it can't prove sound.**

This package is loaded **only** by vigiles's opt-in power tier (behind an
explicit consent, alongside the live-MCP and skill-firing executing checks). The
default `vigiles audit` / `lint` surface stays deterministic and model-free; the
package boundary is what keeps that promise. The deterministic half — mapping a
prose rule to an _existing_ off-the-shelf lint rule and reporting whether it's
enforced — already ships in `vigiles audit` as the **rule inventory**
(`src/rule-inventory.ts`). This tier does the part that inventory can't: the
model-based **synthesis** of a rule for the residue, gated.

> Folded in 2026-07-14 from the former standalone `zernie/agent-rules-compiler`
> repo (now archived with a pointer here). Decision + rationale:
> `migratsiya/49` in the private knowledge base.

## The pipeline

```
prose rule (CLAUDE.md)
  → classify: mechanizable vs semantic
  → [mechanizable] REUSE: map to an existing off-the-shelf rule if one exists
                          (catalog/rule-map.json — the plugin index)
  → [no existing rule] SYNTHESIZE an ESLint rule + an INDEPENDENT self-test
  → TRUST GATE (two-stage, blind gold-set):
        rule must pass its self-test AND a blind gold set it never saw
        pass → kept (safe to enforce)   fail → abstain (no false confidence)
  → [semantic] not mechanizable — handed back as labeled prose
  → kept rules run against the real code (actual enforcement)
```

The gate is the trust anchor: a synthesized checker that matches a rule's
_surface_ but not its _intent_ (the measured "vibe-linting" failure — most
LLM-synthesized checkers silently leak) is caught by the blind gold set and sent
to `abstain` instead of shipping a green check nobody should trust.

## Layout

- `catalog/rule-map.json` — the **plugin index**: prose-intent → existing
  off-the-shelf rule across ESLint core + popular plugins (the REUSE tier).
- `rules/corpus.json` — the real prose-rule corpus (provenance-tagged).
- `gold/` — the blind gold sets + a second rater's labels (inter-rater
  reliability). `gold/SOUNDNESS.md` documents the methodology.
- `gate.js` — the two-stage trust gate (`npm run gate`).
- `run-demo.js` — end-to-end demo over `demo-project/` (`npm run demo`).
- `generated/`, `selftest/`, `synth-agent/` — synthesized rule code + self-tests
  (machine/agent-authored artifacts; exact bytes).
- `measure*.js`, `soundness*.js` — the leak measurement + soundness harness.

## Running

```bash
cd compiler
npm install
npm run gate    # runs the trust gate over the corpus
npm run demo    # end-to-end: compile → gate → enforce on demo-project/
```

## Paper artifact

The two-stage adversarial gold-set gate + its measurement (most synthesized
checkers silently leak; the gate catches it) is the artifact for the companion
paper "Prose Isn't Policy". The reproducible bundle is a zip of this
subdirectory — no separate repo required.
