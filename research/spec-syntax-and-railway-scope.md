---
status: shipped
topic: spec
---

# Spec syntax & railway scope — two decisions, settled with research

> Status: decided (2026-06-20), backed by two web-research passes (cited below).
> Answers two recurring questions: (1) which authoring SYNTAX should `.spec.ts`
> standardize on, and (2) does the railway/Result outcome contract apply to skills
> or only subagents. Both kept getting re-opened; this note closes them.
> Companions: `typed-contracts-for-agents.md`, `fp-for-agent-harness.md`,
> `railway-subagents.md`, `lightweight-spec-authoring.md`.

## Decision 1 — railway/Result is a SUBAGENT contract, not a skill one

**Skills stay free-form (knowledge OR procedure). The typed `Result<ok, err>`
outcome contract (`result()` / `parseAgentResult` / `assertAgentOk/Err`) lives on
SUBAGENTS only.** Forcing it onto skills is a category error.

The reasoning is architectural, not stylistic — it's about the **context boundary**:

- A **subagent** has a discrete call → isolated-context → **return** shape. The
  parent receives a single returned string. That return IS the parse-point a
  `Result<ok, err>` asserts on (`<!-- vigiles:ok/err -->` → discriminated union →
  `assertAgentOk`). The boundary is real, typed, testable.
- A **skill** (default execution) is inserted **into the main conversation as a
  message** and the main agent keeps going. There is no return, no receiver, no
  parse-point. For a knowledge skill ("what did it return?") the question is a
  category error (like asking what a C `#include` returns); for a procedural skill
  the actions happen in the main context with no typed boundary to read them at.
- **The bridge: `context: fork`.** Anthropic's official skill frontmatter
  `context: fork` runs the skill body as the task inside a forked **subagent** —
  which restores the boundary. So when a procedural skill genuinely needs a typed
  outcome, the correct path is `context: fork` + the EXISTING subagent contract,
  not a new skill-level primitive.

Anthropic explicitly models skills as a **spectrum** — "reference content"
(knowledge: conventions, domain facts) and "task content" (step-by-step
procedures) — both first-class. So a skill is sometimes a noun (knowledge) and
sometimes a verb (procedure), but it is never a _returning_ unit; the subagent is.

**Consequences for vigiles:**

- Do NOT add a `Result`/railway `output` contract to `skill()` (a mis-feature —
  was started and reverted 2026-06-20).
- The free-form `body` / gated `steps` model for skills is correct as-is.
- One real, small skill gap surfaced and is now **SHIPPED (2026-06-20, `b19febd`)**:
  `context: "fork"` on `SkillSpec` + an `output?: OutputContract` that's gated to
  forked skills (a compile error otherwise — `output-without-fork`), routing the
  forked skill's `result()` through the existing subagent rail.
- **Agent railway is the keeper** — it's the architecturally-correct home, and it
  deserves great PUBLIC docs (see `docs/railway-subagents.md`).

Sources: Anthropic [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
· [Extend Claude with skills](https://code.claude.com/docs/en/skills) (the
reference-vs-task spectrum + `context: fork`) · [Create custom subagents](https://code.claude.com/docs/en/sub-agents)
(own context window, returns a summary) · practitioner framing
([BoringBot](https://boringbot.substack.com/p/claude-code-skills-subagents-hooks):
"skills run in-context on demand; subagents are isolated workers that return").

## Decision 2 — spec syntax: plain-object backbone + typed-value helpers + tagged template for prose-with-refs

The `.spec.ts` mixes plain objects (`claude({ sections, rules })`), helper
functions (`enforce()`, `file()`), and a tagged template (`instructions\`\``).
That mix is **correct** — it's the same hybrid Drizzle and the ecosystem use, not
drift. The maintainability win is RESTRAINT (stop adding helpers), not unification.

What the evidence says:

- **Plain-object backbone wins and is the most agent-authorable.** Vite, Rollup,
  Vitest, Playwright, and ESLint flat config all converged on
  `defineConfig(plainObject)` — an identity-ish wrapper that gives inference +
  autocomplete with zero ceremony. LLMs generate plain objects (JSON/YAML-shaped,
  dominant in training data) far more reliably than method chains; a wrong object
  KEY errors immediately, a wrong chain METHOD fails obscurely. vigiles's
  `claude()/skill()/agent()` already ARE this pattern. Keep it.
- **Helpers earn their place ONLY when they brand/accumulate a type.** Zod
  (`.min().max()` narrows the type), tRPC (`.input()` adds generics), Drizzle
  columns (`.notNull().primaryKey()` refine column types) — the chain IS a
  type-level computation. vigiles's `enforce()/file()/dir()/glob()` produce
  branded/verified values (the `Rule` union, `VerifiedPath`, type-safe linter
  refs) — they earn it. Keep them.
- **No `section()` helper.** A `section("Arch", "…")` does NO type work — pure
  ceremony. Sections as a plain map (`sections: { arch: "…" }`) is the
  best-practice, more-LLM-friendly shape. Keep the object map.
- **Keep `instructions\`\`` for prose-WITH-refs only.** A prose tag earns its place
  when it does typed interpolation (`${file("x")}`) + branded typing (exactly what
  it does, à la Drizzle `sql\`\``). Plain strings are fine for prose without refs;
`sections`accepts`string | InstructionFragment[]` — the correct hybrid.
- **`doc()` is DROPPED** — it would duplicate `instructions\`\``.

### Length-guarding helpers: compile-time, not the type system

The ask was "make `instructions()` length-restricted, ideally via TS." Researched
honestly: **TypeScript template-literal types cannot bound a string's length at
real scale** — the recursive-tuple technique hits the recursion cap (~43 chars
naive, ~463 with batching; TS issue #52243 is unresolved) and **no tool ships
compile-time content-length validation**. The realistic mechanism is a
**compile-time guard** (a `max` that errors at build — the ESLint `max-len` /
Prettier `printWidth` precedent), which vigiles already has as `maxSectionLines` /
`maxInlineCodeLines` / `maxTokens`.

Design call (don't-cry-wolf): a _hard small_ default would flag legitimate content
— vigiles's OWN spec has a 262-line Key Files section and an 8298-char Positioning
paragraph. So the guard is a **generous default** (200 lines, catches egregious
dumps only), applied to **named prose sections** (claude sections + agent sections
— previously claude-sections-only), overridable via `maxSectionLines`, with
`maxTokens` as the global backstop. Skill `body` is deliberately left uncapped by
default (legitimately variable — real SKILL.md bodies run long); it still honours
`maxSectionLines` if an author opts in.

Sources: [Anthony Fu — Type your Config](https://antfu.me/posts/type-your-config)
· [Vite config](https://vite.dev/config/) · [ESLint defineConfig](https://eslint.org/blog/2025/03/flat-config-extends-define-config-global-ignores/)
· [Drizzle schema](https://orm.drizzle.team/docs/sql-schema-declaration) + [sql\`\`](https://orm.drizzle.team/docs/sql)
· [Zod](https://zod.dev/api) vs [Valibot tree-shaking](https://valibot.dev/guides/comparison/)
· [tRPC builder rationale](https://www.totaltypescript.com/workshops/advanced-typescript-patterns/classes/trpc-creator-on-the-builder-pattern/exercise)
· [TS #52243](https://github.com/microsoft/TypeScript/issues/52243) + [string-length limits](https://blog.beraliv.dev/2021-05-31-string-length-in-typescript)
· [LLM API hallucination modes](https://arxiv.org/html/2409.20550v1).

## Decision 3 — fp library for railway: NONE (stay dependency-free)

**Use vigiles's own discriminated `Result` union (`parseAgentResult` →
`{ kind: "ok" | "err" | "malformed" }`), not an fp library.**

Why no lib: the railway is a **compile-time + parse-time** construct, not a runtime
monad. The compiler emits the orchestrator markdown + the `vigiles:ok/err` wire
format; the MODEL executes the steps; vigiles **parses** the outcome into a typed
union and asserts on it. There is nothing to _execute_ in TS that needs
`.andThen`/`combine`/fibers — so a monad library buys no runtime benefit and adds a
transitive dependency to every consumer of a deliberately dependency-light library.
The existing `ParsedAgentResult` already IS the Result type, zero-dep and
tree-shakeable.

If a runtime combinator layer is ever built (the optional `@vigiles/skill` wrapper
floated in `fp-for-agent-harness.md` — `retry`/`fallback`/`parallel`/`race`), the
pick is **neverthrow** (lightweight, tree-shakeable, `Result`-focused). **Effect.ts**
is rejected for the core (heavy bundle + invasive `Effect<A,E,R>`/fibers/layers,
overkill for a two-track Result); **fp-ts** is rejected (verbose, in maintenance —
its author moved to Effect). But that layer is gated on the A/B eval proving the
existing typed contract helps (measurement-first); until then, **no fp dependency**.

## Also settled

- **Rename "migrate" → "adopt"** in user-facing framing ("start a spec from your
  existing file") — non-scary, incremental. No new CLI (the deterministic
  scaffold stays a follow-up); the `migrate-to-spec` skill + `init` hint get the
  gentler wording.

## Dogfood finding: skill `purity`/`effect` fits read-only skills, not workflow skills (2026-06-20)

Probed whether to convert our 3 model-invocable shipped skills (strengthen,
edit-spec, test-harness) to specs using the new skill features (`purity`,
`effect()`). Verdict: **don't** — the features fit **read-only/advisory** skills
and **fixed-contract subagents** (where the `reviewer-ab` agent A/B already proved
the typed-contract win), **not** code-heavy _mutating workflow_ skills. Four
independent walls, all hit on these three skills:

1. **`purity:bounded/pure` breaks them.** `decidePurityGate` denies any non-read-only
   Bash; their core command IS mutating (`vigiles generate-types` / `compile`,
   `npm i`), so the gate blocks it. `dangerously-unrestricted` is honest but a no-op.
2. **`effect()` is fail-closed + probabilistic.** Read-only-outside-the-region needs
   the _model_ to call `vigiles hook-runtime effect-enter/exit` around its own mutation; a miss
   blocks the command. A deterministic gate that depends on probabilistic model
   compliance isn't a deterministic guarantee for a model-invocable skill.
3. **Backtick-heavy bodies fight the spec.** The verified-refs payoff needs the
   `instructions` tagged-template form, but these SKILL.md bodies are full of code
   fences (every backtick must be escaped). The one reason to spec-ify a skill
   (verified `file()`/`cmd()`/`ref()`) conflicts with code-heavy prose.
4. **Their refs don't cleanly verify.** `npx vigiles generate-types` isn't an npm
   script (`cmd()` checks those) and `.vigiles/generated.d.ts` is gitignored
   (`file()` existence would fail).

Consistent with the project's own stance (`require-skill-spec` deprecated — skills
are legitimately hand-written). **Consequence for positioning:** the README claims
the **agent** typed-contract win (measured) + lint/test/measure (shipped) — it must
NOT claim "purity gates your skills." A future fit: a read-only _advisory_ skill
(no mutation) is a clean `purity:bounded` candidate; revisit then.
