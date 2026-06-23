# Hooks: modes & testing — landscape analysis + what to deliver

> Internal research (2026-06-23). A step-back over the hook surface — both the
> CHECK part (verify/lint a hook) and the RUN part (the runtime) — against the
> OSS/AI-tooling landscape, to decide what to deliver next. Companion to
> `research/hook-pain-points.md` (the failure corpus + compiled-hooks/verify ship
> record) and `research/harness-state-space.md` (the four-instrument framing).

## What vigiles has today (the baseline)

| Part                       | Today                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Checks** (deterministic) | `hook-events`, `hook-script-exists`, `mcp-hook-target-resolves`, `untested-hook` (lint/scan) + `verifyGuardrail` disaster battery (`src/guardrail-check.ts`) + `checkHookImports` (capability at compile)                          |
| **Authoring/compile**      | `vigiles/hook` closed vocab, role family (gate/inject/react), AST `CommandView` (`runs`/`touches`/`pipesToShell`), tamper stamp                                                                                                    |
| **Runtime**                | `hook-runtime run-program` (typed program: load → verify stamp → dispatch by role); hand-written shell hooks run by the harness directly                                                                                           |
| **Testing**                | `runHook` (subprocess), `runHookProgram` (in-process, cheapest), `propertyHook` (property-based), `assertHookDenies/Allows/Blocked/Allowed`, disaster battery, `scaffold-test` (generates a hook test), the adapter contract suite |
| **Modes**                  | **none** — no enforce/observe; no purity-style effect ceiling on hooks                                                                                                                                                             |

## Landscape — what comparable tools provide

| Tool                                   | Restricted API?                                             | Modes / on-fail                                             | Testing                                                           |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| **OPA/Rego + conftest**                | ✅ Rego DSL (verifiable) — opt-in, coexists with raw config | enforce/deny                                                | **`opa test` first-class (`test_` convention) + COVERAGE report** |
| **Guardrails AI**                      | validators API                                              | rich on-fail vocab: exception/fix/filter/refrain/reask/noop | validator tests                                                   |
| **NeMo Guardrails**                    | Colang DSL                                                  | input/output/dialog rails                                   | `nemoguardrails chat` eval                                        |
| **Cedar** (vigiles already references) | ✅ policy DSL + validator                                   | permit/forbid                                               | a test format                                                     |
| **lefthook / pre-commit / husky**      | ❌ raw shell                                                | stages, `skip`, parallel, `run` (manual test)               | none real                                                         |
| **Claude Code hooks (2026)**           | ❌ raw shell                                                | + NEW `prompt` & `agent` hook types (LLM-based), `async`    | none                                                              |

**Cross-tool lesson.** A restricted DSL (OPA/Cedar/eBPF) is what _buys_ verification +
safe execution + cheap testing — but every one is **opt-in and coexists with the
unrestricted form**; none bans raw config. The mature ones ship **on-fail modes**
(Guardrails) and **first-class testing + coverage** (OPA). Sources: Guardrails AI
on-fail actions; OPA policy-testing + conftest; NeMo Colang rails; lefthook config.

## The five design questions, answered

### 1. Restrict the RUN to the TS-only API? → No (two lanes, opt-in)

Restricting _buys_ the guarantees (capability = API-surface, tamper-stamp), the eBPF
pattern. But eBPF is the only in-kernel path _because the kernel forbids raw code_ —
the harness doesn't, and raw `.sh` hooks dominate. Forcing TS kills adoption and
abandons the shell ecosystem `verify` already audits. Keep **two lanes** (the
markdown→spec ladder, exactly how OPA coexists with raw config):

- **Lane 1 — typed TS** (`vigiles/hook`): the _guaranteed_ lane — capability + stamp +
  role-typing. A TS hook contains **no shell**: the gate is a pure `(event)=>Decision`,
  `command.runs(...)` is AST matching, and only `react.run("cmd")` names a command (and
  it's effect-classified). (Common confusion: the typed lane does NOT embed shell
  template literals — the two lanes are separate authoring _formats_, not shell-in-TS.)
- **Lane 2 — hand-written `.sh`**: stays first-class, audited by `verify`, and
  _optionally sandbox-confined_.

Separate the two safety concerns: **authoring-safety** (capability) needs the typed
API; **runtime-safety** (confinement) is language-agnostic via the sandbox — so vigiles
can confine _any_ hook without it being TS.

### 2. Modes like purity? → Yes, but ONE essential mode, not a vocabulary

The first instinct (enforce/warn/shadow/off, copying Guardrails' 6 on-fail actions) is
**over-enumerated**. For a harness GATE the axis is binary — block, or don't-block-but-
record:

- **`enforce`** — block (today's behavior, the default).
- **`observe`** — evaluate + record what it _would_ block, never block. The rollout /
  tuning primitive (WAF "shadow mode"): trust a new gate by observing first, then
  promote to enforce.
- `off` is not a mode — it's not installing the hook / a config toggle.

"warn vs shadow" is a false split (both = observe; agent-nudge vs log is a _rendering_
detail). So the deliverable is **one new mode (`observe`)** on the existing `enforce`
default — maps cleanly onto the existing `Decision` (observe = compute the Decision,
emit a record, exit 0).

A SECOND, orthogonal axis is the literal purity analogy — an **effect ceiling** on a
`react` (declare it read-only; enforce via the effect classifier `run()` already runs at
construction). Medium value, distinct from the enforce/observe axis.

### 3. How is testing done? → Tiered already; the gap is COVERAGE

`runHookProgram` (in-process) → `runHook` (subprocess) → `propertyHook` (property-based)
→ disaster battery → contract suite. The gap vs OPA: no **coverage** ("your tests
exercise N of M events / disasters / decision branches") and no first-class
`vigiles`-driven hook-test ergonomic (it's library-only + `scaffold-test`).
`formatGuardrailReport` is already a neutral coverage map to extend.

### 4. Behavioral testing helpers? → Partial; two real gaps

`runHarnessTest` + the `hookFired` check (over a scripted mock) cover "does it fire in
the assembled machine" (capped by #34692 subagent-bypass). Genuine gaps: **(a)** a
gate's **false-positive / precision** measure (does it block _legit_ commands? — like
skill trigger-precision, model-gated on the sub); **(b)** the new `prompt`/`agent`
**LLM hook types** are inherently non-deterministic → judged behavioral testing
territory vigiles doesn't touch yet.

### 5. Similar tools — covered in the landscape table above

The patterns worth stealing: OPA's **first-class test + coverage**, Guardrails' idea of
an **on-fail mode** (collapsed to observe/enforce here), and the **restricted-DSL-buys-
verification** thesis (which vigiles already embodies as `vigiles/hook`).

## Ranked: what to deliver

1. **`observe` (shadow) mode** — deterministic, high adoption value (trust a new gate by
   observing first), reuses the `Decision` path. The clear #1. (One mode, not four.)
2. **Hook-test coverage report** — OPA-style; extend `formatGuardrailReport`'s neutral
   coverage map to "tests exercise N of M events/disasters".
3. **Document the two-lane decision** (don't force TS-only; shell stays first-class,
   sandbox-confinable) as an explicit non-goal — already captured here.
4. **`react` effect ceiling** (the purity analogy; reuse the effect classifier). Medium.
5. **Explore: verify + judged-test the new `prompt`/`agent` LLM hook types** (new
   harness surface; model-gated). Forward-looking.

Per `prefer-existing-solutions`: #1/#2 are _build_ (they dogfood the existing
Decision/guardrail machinery — no external fit for "shadow a harness hook"); the run-tier
behavioral work (#5) rides the eval machinery vigiles already has, never a new stack.

## See also

- `research/hook-pain-points.md` — the failure corpus + the compiled-hooks/verify ship record + the per-capability dogfood matrix.
- `research/harness-state-space.md` — the four-instrument (construct/verify/gate/test) framing this rolls up into.
- `docs/compiled-hooks.md` — the public compiled-hooks guide.
