---
status: idea
topic: spec
---

# Shareable typed presets — the one place the typed spec earns its keep

> Status: design sketch (2026-06-19). Expands bet #9 from `harness-state-space.md`: a
> reusable, **verified** rule-set published as an npm package that other repos `extends` —
> the durable home for the typed spec even in an agent-authored world (an expert authors it
> once; everyone consumes the compiled markdown + bundled evals). Companion to
> `lightweight-spec-authoring.md` (the spec/`doc()` design) and `instruction-file-linter-landscape.md`
> (why this is a network-effect bet, not a me-too template gallery).

## Why presets, and why now

In an agent-authored world, per-repo edit-time DX fades (agents run `tsc`, not editors). But
the type system's _relational/compositional_ guarantees still pay off when authorship is
**rare and consumption is wide**: an expert writes a preset once; thousands of repos consume
its compiled output. That's where "TS to the fullest" survives the trend. A preset is **code,
not pasted text** — composable, type-checked, and re-verified at the consumer.

## The shape

**Authoring (the publisher):**

```ts
// @acme/harness-preset/index.ts
import { preset, enforce, section } from "vigiles/spec";
export default preset({
  rules: {
    "no-any": enforce(
      "@typescript-eslint/no-explicit-any",
      "Use unknown + narrow.",
    ),
    "no-floating": enforce(
      "@typescript-eslint/no-floating-promises",
      "Await or return.",
    ),
  },
  sections: {
    /* the org's required skeleton, conventions, "Don't" */
  },
  evals: ["./trigger-rates.eval.ts"], // ← bundled tests ship WITH the rules
});
```

**Consuming (every repo):**

```ts
// CLAUDE.md.spec.ts
import acme from "@acme/harness-preset";
export default extends(acme, {
  rules: { "no-any": off() }, // local delta; type-checked: can only override real keys
  sections: { architecture: doc`...` }, // add repo-specific
});
```

## The four design decisions (the work)

1. **Verification re-runs at the CONSUMER — the differentiator.** `extends(acme, …)` doesn't
   trust the preset blindly: on the consumer's `compile`, every `enforce()` is re-checked
   against _this_ repo's eslint/ruff config, every `file()` against _this_ tree. A preset rule
   referencing a rule the consumer hasn't installed → **compile error in the consumer**. This
   is what a pasted template (dead text that can't re-verify) structurally cannot do.
2. **Merge semantics.** Proposal: **deep-merge with explicit `off()` / override**, and a
   **type error if you override a key the preset doesn't declare** (catches drift when the
   preset renames a rule). Composition `extends([a, b])` deep-merges in order; last wins;
   conflicting `enforce` on the same id is an error unless one is `off()`.
3. **Eval bundling.** The preset ships its trigger-rate evals; `vigiles test` in the consumer
   runs them against the consumer's harness. "Install the preset, get the rules **and** the
   proof they fire." No competitor can touch this — it needs the testing layer.
4. **Distribution / network effect.** Presets are npm packages → a gallery, each an install
   funnel; orgs publish a house style; the AGENTS.md/AAIF standard could adopt a canonical
   one.

## Open questions (to settle)

- **Audience:** org/monorepo standards (the bet) vs also language presets shipped by us
  (`vigiles-preset-typescript`)? → both, but org-standards is the durable one.
- **Composition + conflict rule:** `extends([a, b])` order + same-id-conflict handling
  (error vs last-wins) — lean error-unless-`off()`.
- **Empty-gallery cold-start:** ship **2–3 first-party language presets bundled with evals**
  (TS/Python/Rust) as the seed.

## Recommendation

Ship **2–3 first-party language presets bundled with evals** as the seed (answers the
empty-gallery problem and dogfoods `extends` + eval-bundling), target **org/monorepo
standards** as the real audience, and make **consumer-side re-verification** the headline:
_"a preset that proves itself in your repo."_ Caveat: presets only matter at scale (many
repos / a monorepo / an org standard) — a **Tier-3 / team-tier** bet with a high ceiling and a
narrow early audience, not a day-one wedge.

## See also

- `harness-state-space.md` — bet #9 (this) in the ranked list.
- `lightweight-spec-authoring.md` — the `doc()` primitive + `extends`/computed-from-FS levers
  presets build on.
- `sync-tool-compatibility.md` — how presets compose with Ruler/rulesync fan-out rather than
  replacing it.
