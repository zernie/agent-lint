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
| **Modes**                  | `enforce` (default) + `observe` (shadow/rollout — records, never blocks), per gate. No purity-style `react` effect ceiling yet (open #5)                                                                                           |

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

1. **`observe` (shadow) mode** — ✅ **SHIPPED (2026-06-23).** Every gate
   (`defineHook`/`defineFileGate`/`definePromptGate`/`defineStopGate`) takes
   `mode: "enforce" | "observe"`. `gateAction(decision, mode)` is the pure mapping
   the runtime + tests share; in observe the runtime exits 0 and appends a record
   to `.vigiles/hook-observations.jsonl`. Harness-NEUTRAL (exit 0 + a local
   record), so it's covered once. (One mode, not four — the deny/ask "warn vs
   shadow" split collapsed to a rendering detail of one `observe` action.)
2. **Gate-capable `UserPromptSubmit` + `Stop` + richer event shapes** — ✅
   **SHIPPED (2026-06-23).** `definePromptGate` (sees `e.prompt`, can `deny` to
   block a prompt) and `defineStopGate` (sees `e.stopHookActive`, `deny` keeps the
   agent going — gate-until-tests-pass) ride the same exit-2 gate runtime, so they
   work on CC AND Codex (compile-emit tested for both). React gained `e.response`
   (a `ResponseView` with `isError()`/`contains()`) so a PostToolUse reaction can
   branch on whether the tool FAILED. This RE-RANKED above the original #2
   (coverage report) per the "DECISIONS over any event" refinement below.
3. **Hook-test coverage report** — OPA-style; extend `formatGuardrailReport`'s neutral
   coverage map to "tests exercise N of M events/disasters". Still open.
4. **Document the two-lane decision** (don't force TS-only; shell stays first-class,
   sandbox-confinable) as an explicit non-goal — already captured here.
5. **`react` effect ceiling** (the purity analogy; reuse the effect classifier). Medium.
6. **Explore: verify + judged-test the new `prompt`/`agent` LLM hook types** (new
   harness surface; model-gated). Forward-looking.
7. **Generic `tool_input` accessors + I/O-dependent decisions** — the remaining
   "richer event shape" + external-state piece: WebFetch URL / Task `subagent_type`
   / MCP args for the tool gates, AND letting a decision read external state (git
   branch, project-specific facts) WITHOUT arbitrary I/O. Designed in
   `research/hook-context-providers.md` (pure decision + host-gathered, declared
   context providers + a graceful-degradation opt-out ladder that covers every
   real-world hook). Open.

Per `prefer-existing-solutions`: #1/#2 are _build_ (they dogfood the existing
Decision/guardrail machinery — no external fit for "shadow a harness hook"); the run-tier
behavioral work (#5) rides the eval machinery vigiles already has, never a new stack.

## Does the typed lane cover all use cases? (10-OSS dogfood, 2026-06-23)

Mapped real hooks from 10 OSS sources to the `vigiles/hook` vocabulary. Corpus:
disler/claude-code-hooks-mastery (the full event spectrum), alexknowshtml/claude-code-safety-hooks
(`dcg.sh` — PreToolUse gate + token approval), the vendored superpowers + oh-my-claudecode
(SessionStart, UserPromptSubmit) + wshobson, the Claude Code docs canonical hooks
(block-`.env`, bash validator, format), disler's ruff/ty validators (lint-on-write), the
TTS/notify hooks (Notification/Stop/SubagentStop), gmickel/flow-next, and the guide patterns
(auto-format, test-on-stop gate, cost/observability).

| Real use case (source)                                                           | `vigiles/hook`                                                                 | Verdict                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Block dangerous bash — rm -rf / force-push (disler, dcg)                         | gate `command.runs`/`touches`                                                  | ✅                                                          |
| Block secret read — `.env`, `~/.ssh` (disler, dcg, CC docs)                      | gate `command.touches`                                                         | ✅                                                          |
| Block `curl \| sh` (CC ecosystem)                                                | gate `command.pipesToShell`                                                    | ✅                                                          |
| Block edit to a protected path                                                   | file-gate `path.under`                                                         | ✅                                                          |
| Auto-format / lint on write (ruff/ty validators)                                 | react `run()`                                                                  | ✅ (run); block-on-lint is n/a — CC PostToolUse can't block |
| Inject STATIC context at SessionStart                                            | `inject(text)`                                                                 | ✅                                                          |
| **Inject DYNAMIC context — git status, open issues (disler, superpowers, omcc)** | `inject` — but the closed vocab bans fs/exec, so `produce()` can't gather it   | ❌ **GAP**                                                  |
| **Prompt-aware inject — read the prompt then inject (disler UserPromptSubmit)**  | inject still carries no prompt text, but a prompt GATE sees `e.prompt`         | ➖ partial (gate yes; prompt-aware _inject_ open)           |
| **Validate / block a user prompt — security filter (disler)**                    | `definePromptGate` — sees `e.prompt`, `deny` blocks it — ✅ **SHIPPED**        | ✅ (block/validate; rewrite still out)                      |
| **Stop-gate — block stop until tests pass (guides)**                             | `defineStopGate` — `deny` keeps the agent going, loop-guarded — ✅ **SHIPPED** | ✅                                                          |
| **TTS / desktop notify on Notification/Stop/SubagentStop (disler)**              | react `run()` only, on a non-file event                                        | ➖ partial (event shape carries no context)                 |
| **React to tool RESPONSE — error capture (disler post_tool_use_failure)**        | react event carries `e.response` (`isError()`/`contains()`) — ✅ **SHIPPED**   | ✅                                                          |
| Log tool calls to a file (disler post_tool_use)                                  | react `run()`                                                                  | ➖ (no structured event access)                             |
| **PermissionRequest auto-allow read-only (disler)**                              | no role/event for it                                                           | ❌ **GAP**                                                  |
| Stateful — token approval / rate-limit / ordering (dcg)                          | pure vocab, no cross-call state                                                | ❌ **deliberate** (guards.ts prototype)                     |
| Arbitrary I/O to decide (call a service)                                         | capability = API surface bans it                                               | ❌ **deliberate**                                           |

**Verdict: NO, it does not cover all use cases — and that's the two-lane decision working
as designed.** The typed lane nails the **SAFETY-GATE slice** (PreToolUse block: dangerous
bash, secret reads, `curl|sh`, protected-path edits) — the highest-value, most
false-confidence-prone use cases — plus simple react/inject. The gaps cluster by root cause:

- **Caused by PURITY (no exec / impoverished event shapes):** dynamic-context inject, TTS,
  backups, structured logging, tool_response reactions. These NEED I/O — so they belong in
  the **shell lane** (audited by `verify`, sandbox-confined). Forcing them into the pure
  vocab would break the capability guarantee that's the whole point. **Don't close these in
  typed; they're the shell lane's job.**
- **Caused by MISSING roles/shapes (closeable, and worth it):** (1) gate-capable
  `UserPromptSubmit` (validate/block a prompt) and `Stop` (gate-until-tests-pass) —
  ✅ **SHIPPED 2026-06-23** (`definePromptGate`/`defineStopGate`); (2) richer event
  shapes so more DECISIONS are expressible — `tool_response` in react ✅ **SHIPPED**
  (`e.response`), the prompt text in a UserPromptSubmit decision ✅ **SHIPPED**
  (`e.prompt`), `tool_input` beyond Bash/path (WebFetch URL, Task `subagent_type`,
  MCP args) — STILL OPEN (deliverable #7). These are DECISIONS (the typed lane's
  sweet spot), just on events/fields the vocab didn't expose yet.

So the refined scope: **typed lane = DECISIONS over any event; shell lane = I/O & lifecycle
side-effects.** The flagship (PreToolUse gate) is solid; the highest-leverage typed-lane
EXPANSION — gate-capable UserPromptSubmit/Stop + richer event shapes — is now LARGELY
SHIPPED (prompt/stop gates + `e.response`); the lone remaining shape is the generic
`tool_input` accessors (WebFetch/Task/MCP), deliberately deferred to avoid a stringly-typed
bag. The I/O-bound lifecycle hooks stay shell, by design.

## Driving ADOPTION of compiled hooks — the nudge, not a requirement (decided 2026-06-24)

If compiled hooks fix real bugs (the 2/7→7/7 dogfood), shouldn't lint PUSH people onto
them? We walked three options and rejected the first two:

- **`require-hook-spec` lint rule — REJECTED.** It's FORM-based (compiled vs not), so it
  fires on a CORRECT hand-written hook exactly like a broken one — the "valid is not true"
  sin vigiles criticizes in other linters. It repeats the deprecated `require-skill-spec`
  mistake (requiring a _spec_ per artifact was the wrong axis; requiring a _test_ was right).
  And it's POST-HOC — lint fires after the hook is written, the worst moment to say "should've
  been typed." It also contradicts the two-lanes decision (hand-written `.sh` is a
  first-class lane).
- **`hook-false-confidence` static detector — REJECTED.** A static analyzer for the
  anti-patterns (exit-1-not-2, wrong field, grep matcher) REIMPLEMENTS `guardrail-check`
  (which already proves a hook blocks, dynamically, in EITHER lane) — a worse partial copy
  of our own moat. Still post-hoc; doesn't help AUTHORING.
- **`prefer-compiled-hooks` — SHIPPED.** A SINGLE repo-level recommendation (one finding
  regardless of hook count; default `warn`/`ℹ`; opt-out) nudging hand-written hooks toward
  compiled `vigiles/hook`; message links the guide. Volume-safe (the "few hooks" reframe:
  most repos have 1–3 hooks, so a per-hook rule is both noisy AND low-leverage; one nudge is
  neither). Precedent: `skill-frontmatter` is the same soft-recommendation shape. Honest
  caveat in its doc: still form-based, so it stays a recommendation, never an error default.
  Detector `manualHookCount` in `src/scan.ts`, shared by lint + scan (one-detector-no-drift).

The real lesson: **lint is the wrong instrument for an authoring-time win.** The lever that
actually produces good NEW hooks is the AUTHORING on-ramp — a model-invocable
**`write-hook`/`harden-hook` skill** that writes a compiled `vigiles/hook` spec from a
plain-English "block X" request (the great-agent-flow carrot the nudge points at). UNBUILT;
it's the natural follow-up to `prefer-compiled-hooks`. For existing hooks, `guardrail-check`

- `untested-hook` remain the verify backstop.

## See also

- `research/hook-context-providers.md` — I/O-dependent decisions via pure-decision + declared context providers + the graceful-degradation opt-out ladder (deliverable #7's external-state half).
- `research/hook-pain-points.md` — the failure corpus + the compiled-hooks/verify ship record + the per-capability dogfood matrix.
- `research/harness-state-space.md` — the four-instrument (construct/verify/gate/test) framing this rolls up into.
- `docs/compiled-hooks.md` — the public compiled-hooks guide.
