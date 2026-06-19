# Lightweight spec authoring — what real CLAUDE.mds need, and why the spec is too heavy

> Status: design synthesis (2026-06-19). Grounded in a sweep of ~16 real-world
> CLAUDE.md / AGENTS.md files. Two findings: (1) the current `claude({...})` spec
> shape is **too heavy** — it shreds a document into four maps and re-renders it,
> destroying the author's structure; (2) the durable spec value is **composition +
> templates + computed content**, not reference verification (which markdown mode
> already does). Companion to `instruction-file-linter-landscape.md` (why templates
> are an _authoring ergonomic_, not the competitive moat) and `docs/markdown-mode.md`
> (the level ladder this refines).

## Why this matters

A running thread: is the typed `.spec.ts` worth keeping, or should markdown be the
destination? The honest answer turned out to be **segmented** — and it depends on what
real instruction files actually look like. So we read ~16 of them.

## The corpus (what real files look like)

Sampled across size, language, and harness: small TS/Py/Kotlin libs (EDSL, LangGraphJS,
DroidconKotlin, AI-IntelliJ, Lamoom, ~250–320 words), large structured monorepos
(vercel/ai, cloudflare/workers-sdk, prisma ~4,500 words, nx, vscode), and AGENTS.md
adopters (openai/codex, openai-cookbook, temporal, pydantic-ai). Plus the AGENTS.md
standard (ASDLC) and a community CLAUDE.md template repo.

### The recurring skeleton

Authors keep reinventing the same shape: **Commands → Code Style/Conventions →
Architecture/Structure → Testing → [Don't / Permissions]**. The community template repo
and the ASDLC AGENTS.md spec both converge on a fixed skeleton
(`Project / Stack / Structure / Commands / Verification / Conventions+Don't`; ASDLC adds
NEVER·ASK·ALWAYS _judgment tiers_). Direct evidence that a **required-section template**
matches what people hand-roll.

### The recurring smells (the ones only structure/code can fix)

- **Architecture-in-prose with zero file paths** — LangGraphJS names four layers
  (Channels/Checkpointer/Pregel/Graph) with **no paths**; the agent can't navigate.
  Near-universal.
- **Mutable state in a durable file** — DroidconKotlin literally has a `## Current Task`
  section; Lamoom embeds a live coverage %; Pareto hard-codes `helperToolVersion="1.0.3"`;
  "Recent Learnings"/"Knowledge reminders" retrospective logs appear in cookbook, vscode,
  prisma. A typed spec **structurally cannot represent** in-flight state — that's a feature.
- **Stale-prone path sprawl** — SG-Cars-Trends ~18 prose paths incl. sub-`CLAUDE.md`
  refs; prisma ~60 deep internal paths; pydantic-ai lists 11 sub-`AGENTS.md` files.
- **Duplicated / competing command paradigms** — Lamoom mixes `make` and `poetry`; nx
  copies the PR template from `.github/PULL_REQUEST_TEMPLATE.md` (will drift).
- **Behaviour/workflow smuggled into a code-quality file** — temporal's "Tone & Style",
  nx's "GitHub Issue Response Mode" — system-prompt concerns, not code rules.
- **Wall-of-prose** — prisma: **0 headings in ~4,500 words**; pydantic-ai defers its
  actual coding guidelines to a separate file.

## The diagnosis: the weight is the 4-bucket top-level shape

`claude({ commands, keyFiles, rules, sections })` forces you to **shred** a document into
four maps and then **re-render** them in vigiles's layout. That destroys native structure:

- LangGraphJS's `pnpm lint` _(fix with `pnpm lint:fix`) — uses oxlint_ → a `cmd→string`
  map can't hold the secondary command or the annotation.
- vercel/ai's **two separate command tables** (Root vs Package) → flattened into one list.
- temporal's flowing **Core Mandates** bullet list → forced into `rules: { name:
guidance() }` with a `### Title` per item, mangling it.

The helpers themselves (`cmd/file/enforce/symbol`) are fine. The **container** is the
problem.

## The proposal: a section-first `doc()` primitive

Keep the author's exact headings/prose; make helpers **inline interpolations**; verify
only those; pass everything else through verbatim. LangGraphJS, near-verbatim:

```ts
import { doc, cmd, dir, enforce } from "vigiles/spec";

export default doc`
# LangGraphJS Development Guide

## Build & Test Commands
- Build: ${cmd("pnpm build")}
- Lint: ${cmd("pnpm lint")} (fix with ${cmd("pnpm lint:fix")}) — uses oxlint
- Test: ${cmd("pnpm test")} (single test: ${cmd("pnpm test:single")} /path/to/test.test.ts)

## Library Architecture
### System Layers
- **Channels Layer**: ${dir("libs/langgraph/src/channels")} — BaseChannel, LastValue, Topic
- **Pregel Layer**: ${dir("libs/langgraph/src/pregel")} — execution engine
- **Graph Layer**: ${dir("libs/langgraph/src/graph")} — Graph, StateGraph
`;
```

Two harder shapes the primitive must support:

- **Helpers inside table cells** (vercel/ai): `| ${cmd("pnpm build")} | Build all |`,
  `| ${dir("packages/ai")} | Main SDK |`, `| ${glob("packages/*")} | Providers |`.
- **Verbatim helperless prose** (temporal Core Mandates, vercel "Do Not") — passes
  through untouched; the rigid `rules` bucket actively harms these.

This is the "few primitives + keep your structure" shape: the structured `claude({...})`
stays for users who want the coverage/rules-matrix/monotonicity machinery; `doc()` is the
light end.

## The helper gap (what the real files demand and we don't ship)

| Helper                                      | Demanded by                                             | Exists?                                                                     |
| ------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| **`dir()`** — directory exists              | temporal (whole Project Structure), LangGraphJS, vercel | ❌ only `file()` — the #1 gap                                               |
| **`glob()`** — ≥1 match for a pattern       | vercel `packages/<provider>`, `examples/<function>/`    | ❌ placeholders unverifiable today                                          |
| **command verifier beyond npm**             | temporal `make lint-code`, biome `just`, prisma `make`  | ⚠️ `cmd()` is package.json-shaped; need Makefile/`project()` role awareness |
| **package-scoped symbol** (export, no file) | vercel Core APIs table (`generateText` in `ai`)         | ⚠️ `symbol()` needs a concrete file path                                    |
| inline helpers in arbitrary markdown/tables | all three                                               | ⚠️ exist, but only hoisted or inside per-section `instructions`             |

`dir()` is the single highest-leverage addition — it fixes the architecture-floats-free
smell that appears in nearly every file.

## Spec-exclusive levers, bucketed honestly

The trap is calling markdown-portable things "spec-only." Three buckets:

- **Markdown already does it** (shipped marks): `enforce`, and `vigiles:file/cmd/symbol`
  refs in prose. _Not_ a spec advantage.
- **Portable with engine work**: required-section _verification_ (a lint rule could parse
  headings), size ceiling (count words), flat typed enums (extend the frontmatter schema).
- **Genuinely code-only** (the real spec value):
  1. **Required-section TEMPLATE** — start from the skeleton; omission is a _type error_,
     not a runtime warning. (Root files only — see below.)
  2. **Computed-from-filesystem** — `keyFiles` from a glob, "core modules" from
     `src/core/*`, commands from package.json. Stays fresh; markdown is static → stales.
  3. **`extends` / presets** — a monorepo shares one base spec; per-package specs add only
     deltas. nx ships a flat 150-line root with **zero** nesting because flat markdown
     forces "duplicate everything or nest nothing." Code-only.
  4. **Typed policy enums** — ASDLC's NEVER·ASK·ALWAYS, EDSL's permission tiers, vercel's
     patch-only changesets — as a constrained value, not prose.
  5. **Mutable-state-unrepresentable** — no `task()` primitive, no version literal; a
     retrospective-log section has nowhere to go. A benefit by omission.

## Compile-time mark nudge via template-literal types

The high-signal `word/word.ext` path shape _is_ pattern-matchable at the **type** level:

```ts
type LooksLikePath<S> =
  S extends `${string}/${string}.${"ts" | "tsx" | "js" | "py" | "rs" | "go"}${string}`
    ? "✗ wrap this path in file()/dir()"
    : S;
```

A bare `libs/x/y.ts` in a `doc\`...\``quasi can type-error "wrap in`file()`/`dir()`" —
strictly stronger than the runtime refs-hook (compile-time, in the type system) and
genuinely spec-exclusive (markdown has no types). The floor only returns for the ambiguous
tail (extensionless paths, paths that are really examples). So `doc()` still _nudges_
marking without _forcing_ structure.

## The segmentation conclusion (does the spec earn "apex"?)

Demand splits cleanly by file size/structure:

- **Small/simple files** (≈half the sample, ≤320 words): need only `enforce()` + `file()`
  verification — **markdown already delivers both**. The spec buys them nothing →
  **markdown is the destination, not a stepping stone**.
- **Large/structured/monorepo files** (prisma, nx, cloudflare, vercel, pydantic): drowning
  in the smells only code fixes (no structure, cross-file duplication, stale FS-derived
  prose, no inheritance) → **the spec earns apex** via templates + `extends` + computed
  content + typed policy.

The lever even **bifurcates by tree position**: the **root** gets a required-section
**template**; **nested** sub-files get **`extends(base)`** deltas (forcing a 6-section
template on a 10-line package override would be an anti-pattern).

## Recommendation (ranked)

1. **Add a section-first `doc()` primitive** beside `claude({...})` — the light end that
   keeps the author's structure + inline helpers + verbatim prose. Resolves
   "not all CLAUDE.mds translate."
2. **Ship the missing helpers, by demand:** `dir()` (#1) → `glob()` → broaden command
   verification (Makefile / `project()` role) → package-scoped symbol.
3. **Wire the template-literal path nudge into `doc()`** — the one enforcement lever that
   is genuinely spec-only, landing exactly where the light surface needs it.
4. **Position the spec as the power tier for monorepo/large/multi-repo** — root templates +
   `extends`; not as the universal upgrade. Markdown stays first-class (and should ride a
   CommonMark AST — see the landscape doc).
5. **Templates are an authoring win, not a competitive moat** (see
   `instruction-file-linter-landscape.md`): "required sections" already ships in
   claudelint/cclint. The moat is the FP-calibrated cross-referencing engine + harness
   testing.

## See also

- `instruction-file-linter-landscape.md` — why templates are an authoring ergonomic, not
  the moat; the AST-extraction recommendation for markdown mode.
- `docs/markdown-mode.md` — the public level ladder (inline → frontmatter → spec) this
  refines; `doc()` is a lighter Level-2 on-ramp.
- `reference-verification-limits.md` — the marking floor (active vs passive; the
  undecidable tail the template-literal nudge bumps against).
- `sync-tool-compatibility.md` — the monorepo fan-out that `extends` complements rather
  than replaces.
