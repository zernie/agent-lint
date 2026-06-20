<!-- vigiles:ignore-file -->

# End-to-end walkthrough — what it all looks like

> Status: design illustration (2026-06-19). One realistic skill (`release`) carried from
> free-form prose → typed contract + side-effect boundary → compiled artifact → runtime gate →
> deterministic test → measurement. Shows how the threads compose: `doc()`/`spec-api-design.md`,
> `typed-contracts-for-agents.md` (Result), `side-effect-separation.md` (the boundary),
> `measurement-authority.md` (the eval). **Not all shipped** — `[exists]` / `[proposed]` tags
> mark which is which.

The example skill: **`release`** — decide a semver bump + changelog (pure), then write the
changelog, tag, and publish (side effects).

---

## Rung 0 — free-form SKILL.md (what people write today) `[exists]`

```md
---
name: release
description: Cut a release — bump version, write changelog, tag, publish
---

Look at the commits since the last tag, decide the semver bump, write the
changelog, update package.json, tag the version, and publish to npm.
```

Problems: the **decision and the side effects are tangled**; it's only testable by _running it
and eyeballing_; nothing stops the agent publishing at the wrong moment. vigiles meets you here
— it'll write a (model-judged) eval for this as-is. Then you climb.

---

## Rung 1–2 — the typed spec `SKILL.md.spec.ts` `[proposed]`

```ts
import { skill, doc, cmd, file, effect, result, off } from "vigiles/spec";

export default skill({
  name: "release",
  description:
    "Cut a release: decide the bump, write the changelog, tag, publish",

  // typed outcome — assertable, with a TAGGED error union (not a bare reason string)
  returns: result(
    { version: "string", changelog: "string", url: "string" }, // ok
    {
      DirtyTree: { files: "string[]" }, // err variants, each tagged + structured
      NoCommits: {},
      PublishFailed: { registry: "string", code: "number" },
    },
  ),

  body: doc`
    ## Decide (pure)
    Read ${cmd("git log")} since the last tag, decide the semver bump, and draft the
    changelog. Compute the new ${file("package.json")} version **in memory** — do not write yet.

    ## Apply
    ${effect`
      Side effects are allowed ONLY inside this block:
      - write ${file("CHANGELOG.md")}
      - ${cmd("git tag")} the new version
      - ${cmd("npm publish")}
    `}
  `,
});
```

What each piece buys you:

- **`doc\`...\``** — your prose verbatim, with typed `file()`/`cmd()` holes (autocomplete, no
  editor plugin). Prose isn't type-checked (fine); the refs are.
- **`effect\`...\``** — marks the side-effect **boundary**. Everything outside it is pure; the
  runtime gate denies side-effecting tools there.
- **`result(ok, { Tag: fields })`** — the typed, **tagged** outcome. `assertAgentOk` returns a
  typed value; `err._tag` is exhaustive + JSON-round-trips.

---

## What `vigiles compile` emits — `SKILL.md` (the build artifact) `[exists + proposed marks]`

```text
<!-- vigiles:sha256:9af… compiled from skills/release/SKILL.md.spec.ts -->
---
name: release
description: "Cut a release: decide the bump, write the changelog, tag, publish"
---

## Decide (pure)

Read `git log` since the last tag, decide the semver bump, and draft the changelog.
Compute the new `package.json` version **in memory** — do not write yet.

## Apply

<!-- vigiles:effect -->

Side effects are allowed ONLY inside this block:

- write `CHANGELOG.md`
- `git tag` the new version
- `npm publish`

<!-- /vigiles:effect -->

## Output

End your turn with a `vigiles:ok` or `vigiles:err` block:

- ok → `{ version, changelog, url }`
- err → `DirtyTree { files }` | `NoCommits {}` | `PublishFailed { registry, code }`
```

The markdown is a build artifact (integrity-hashed). The agent reads plain markdown; the
`vigiles:effect` comments are what the gate keys on.

---

## The CLAUDE.md spec — `doc()` + `extend` a preset `[proposed]`

```ts
import { claude, doc, dir, cmd, extend, off } from "vigiles/spec";
import tsPreset from "@acme/harness-preset"; // shared, verified, ships its own evals

export default extend(
  tsPreset, // stratified merge: rules property-merge, arrays replace, scalars override
  claude({
    body: doc`
      # MyApp

      ## Commands
      - ${cmd("npm test")} — run tests
      - ${cmd("npm run build")} — build

      ## Architecture
      Core engine in ${dir("src/core")}; adapters in ${dir("src/adapters")}.
    `,
    rules: { "no-any": off() }, // local delta over the preset; off() removes a rule
  }),
);
```

`extend` re-verifies every inherited `enforce()`/`file()` against **this** repo on compile — a
preset rule that doesn't resolve here is a compile error.

---

## Runtime — the deterministic gate (no model) `[exists rail + proposed effect-keying]`

The `PreToolUse` hook classifies each tool from the dialect catalog (read-only vs side-effecting)
and denies side-effecting tools outside an active `vigiles:effect` boundary. A trace:

```
[Decide] Read(package.json)            → allow   (read-only)
[Decide] Grep("BREAKING")              → allow   (read-only)
[Decide] Write(CHANGELOG.md)           → DENY    "side-effecting tool outside a vigiles:effect boundary"
[Apply ] Write(CHANGELOG.md)           → allow   (inside the effect boundary)
[Apply ] Bash(npm publish)             → allow   (inside) — and the sandbox confines the subprocess
```

Robustness: default-deny + boundary-allow means a **mis-mark can only over-block (safe)**, never
create an unsafe allow. `Bash`/subprocess effects (undecidable by tool name) are sealed by the
**sandbox**, not the hook — the two layers compose.

---

## Test — the boundary is the seam `[exists primitives, proposed effect-scope]`

```ts
import {
  runHarness,
  assertAgentOk,
  intercept,
  tool,
  notTool,
} from "vigiles/testing";

const run = await runHarness(releaseSpec, {
  task: "cut a patch release",
  intercept: [intercept(tool("Bash", { command: /npm publish/ }))], // don't really publish
});

// deterministic — no model judging prose, because the contract is typed:
assertAgentOk(run, { version: "1.2.4" }); // the typed Result
notTool(run, "Write", { outsideEffect: true }); // never wrote outside the boundary
```

The same `effect` mark that gates production is the **interception point** in test — one mark,
two payoffs (safety + deterministic testability).

---

## Measure — effectiveness, not just correctness `[exists eval engine]`

```ts
import { measure, skill, judged, latency } from "vigiles/testing";

const report = measure(releaseSpec, {
  trials: 10,
  checks: [
    skill("release"), // does it FIRE on a release request? (deterministic)
    latency(), // how slow / costly? (deterministic)
    judged("changelog accurately summarizes the commits"), // quality (model — thin)
  ],
});
```

And the ecosystem/per-repo question the identity rests on: `vigiles optimize` runs the same
engine across arms (this skill vs an alternative vs none) and reports the measured delta.

---

## The entire flow (and the cost-ladder it walks)

```
1. AUTHOR free-form SKILL.md ............ rung 0, zero friction        [model-judged test only]
        │
2. /strengthen (Haiku) PROPOSES ......... effect-boundary marks +      [model proposes]
        │                                  a Result contract → you confirm
3. vigiles compile ...................... SKILL.md artifact +          [deterministic]
        │                                  effect marks + integrity hash
4. RUNTIME gate (PreToolUse) ............ deny side-effecting tools    [deterministic, fail-closed]
        │                                  outside the boundary; sandbox seals subprocesses
5. TEST (runHarness) .................... intercept at the boundary +  [deterministic for the
        │                                  assert the typed Result      contract; model only for prose]
6. MEASURE (measure / optimize) ......... A/B effectiveness on real    [model — kept THIN]
                                           tasks → "what actually works"
```

Each rung **pushes work down the cost-ladder** — every bit of structure you add converts an
expensive model-judge into a free deterministic assert:

| Layer          | Cost              | What it decides                                 |
| -------------- | ----------------- | ----------------------------------------------- |
| lint / gate    | free, every event | refs resolve · effects only at the boundary     |
| typed contract | free, per test    | the Result is correct · no effect outside seam  |
| trigger / eval | model, thin       | does it FIRE · is the output GOOD · what's BEST |

The discipline (top to bottom): **construct what you can in types, verify what you can't in
lint, gate what's left in the loop, and pay a model only for the irreducibly-fuzzy last mile.**

## See also

- `spec-api-design.md` — the `doc()` / `result()` / `extend()` API this uses.
- `typed-contracts-for-agents.md` — why the typed outcome + boundary make the unit testable.
- `side-effect-separation.md` — the gate + sandbox + auto-marker behind step 4.
- `measurement-authority.md` — the measure/optimize identity behind step 6.
- `examples/railway/ship-pr.md.spec.ts` — a shipped railway example in the same spirit.
