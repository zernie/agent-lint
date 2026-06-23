# Hook context providers — I/O-dependent decisions without losing the moat

> Internal research (2026-06-23). How a COMPILED hook can decide on external
> state (git branch, file contents, a project-specific tool) without breaking the
> `capability = API surface` guarantee — and how the opt-out ladder covers EVERY
> real-world hook, so the typed lane is never a dead end. Companion to
> `research/hook-modes-and-testing.md` (the modes/coverage analysis) and
> `research/hook-pain-points.md` (the failure corpus + ship record). **v1 (built-in
> providers — `git.branch`/`git.isDirty`/`cwd`) is SHIPPED**; v2 (user-declared
> providers) + the rest of the ladder are designed below. Build order at the end.

## The problem

A gate today is a PURE `(event) => Decision` over what the matchers expose
(command leaves, file path, prompt text, tool response). That's the moat: the
hook imports only `vigiles/hook`, does zero I/O, so it's analyzable and can't
exfiltrate. But real hooks often need EXTERNAL STATE to decide:

```bash
# the hand-written hook can shell out to decide — the compiled one can't (yet):
if [ "$(git branch --show-current)" = "main" ]; then exit 2; fi
```

The naive fix — let the hook do I/O — destroys the guarantee. We need
I/O-dependent decisions AND the capability guarantee AND coverage of the long
tail (obscure / project-specific facts a curated set will never include).

## Prior art — everyone resolves this the same way

| Engine                      | How a decision gets external facts                                                                                                          | Arbitrary I/O from the policy?                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Cedar**                   | Caller passes `entities` + `context` (time, IP, MFA) into `is_authorized`; policy reads `context.x`                                         | **No** — policy pure by design                                                                                   |
| **OPA**                     | `input` + bundled `data` documents pushed by the host ("overload input")                                                                    | `http.send` exists but is "the ugly" — latency + trust                                                           |
| **Gatekeeper** (OPA on k8s) | A registered **Provider** model: a closed set of named providers; **Gatekeeper itself** (trusted controller) makes the call, not the policy | **Explicitly rejected `http.send`** — _"restricting which hosts a user can access"_ + _"providing an interface"_ |

**The unanimous lesson:** the policy never fetches; the **trusted host** gathers
external facts and hands them in. If facts must be PULLED, do it through a
**closed, declared provider registry** — never arbitrary I/O from the policy.
Gatekeeper is the sharpest precedent: it HAD `http.send` and deliberately moved
to registered providers because "any endpoint" access was unacceptable. That is
exactly our `capability = API surface` tension.

## The reframe: the moat is "no UNDECLARED capability", not "zero I/O"

A built-in provider and a user's own provider are both fine **as long as the I/O
is declared and named, outside the opaque `decide` body.** What's banned is
_arbitrary, hidden_ I/O inside the decision. The guarantee shifts from:

> "the hook does no I/O"

to:

> "the hook does exactly the I/O it **declares**, through named providers the
> **trusted runtime** runs — so the capability-diff can still print every fact a
> hook reads."

That preserves the actual moat (analyzability / a diffable capability surface)
while admitting external state.

## The design: pure decision + host-gathered, declared context

`decide` stays pure. The trusted `hook-runtime` gathers a DECLARED set of
read-only facts and injects them as `e.ctx`. The hook DECLARES what it needs;
undeclared access is a `tsc` error (the typed-purity trick), so the dependency
is explicit and auditable.

```ts
import { defineHook, tool, deny, allow } from "vigiles/hook";

export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  needs: ["git.branch"], //            ← DECLARED: capability-diff/audit sees it
  decide: (e) =>
    e.ctx.git.branch === "main" && e.command.runs("git push")
      ? deny("no direct pushes to main")
      : allow(),
});
```

Why every guarantee survives:

- **Capability = API surface — intact.** The hook does zero I/O; the runtime
  runs `git branch --show-current` (proven read-only by `bash-effects`) and hands
  the result in.
- **Analyzability — better.** `needs: [...]` makes the dependency typed +
  explicit; the capability-diff prints _"reads git state"_. A shell hook that
  secretly shells out cannot offer that.
- **Determinism — per-invocation.** Each provider runs at most once per event,
  cached. (Caveat: a small TOCTOU window — the branch could change between gather
  and the real tool call — but for a PreToolUse gate that window is tiny and it's
  strictly better than no check. Documented, not hidden.)

## The opt-out ladder — graceful degradation, never a dead end

The curated set can't cover everything, so the model is a graduated ladder (the
same shape as vigiles's purity `pure → bounded → dangerously-unrestricted` and
the Level 0/1/2 adoption ramp). Each rung trades analyzability for capability,
**consciously and visibly** — like TypeScript's `any` / `@ts-ignore`: the type
system never traps you, you opt out locally and the opt-out is visible.

| Tier                           | For                                                             | What it is                                                                                                                                                                                                                                        | Safety                                                                           |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **0. Built-in matchers**       | block/allow on the command/path/prompt/response itself          | today's pure gate (`runs`/`touches`/`under`/`e.prompt`/`e.response`)                                                                                                                                                                              | fully analyzable, zero I/O                                                       |
| **1. Built-in providers**      | the famous 80% of external facts                                | `git.branch`, `git.isDirty`, `cwd` — zero-arg, read-only                                                                                                                                                                                          | provably read-only, zero-config                                                  |
| **2. User-declared providers** | the long tail — obscure / project-specific tools                | a **named** provider you register: `defineProvider({ name, run, effect })`; its stdout becomes `e.ctx.<name>`. Read-only by default; a side-effecting provider needs a loud `dangerously` opt-out (the `purity:'dangerously-unrestricted'` shape) | analyzable: named + declared + effect-classified                                 |
| **3. Shell lane**              | truly arbitrary in-decision logic / capabilities no role models | hand-written `.sh`, verified with the disaster battery (`assertBlocksDisasters`)                                                                                                                                                                  | Turing-complete; you've consciously left the analyzable zone — verify it instead |

The design rule that keeps tiers 1–2 honest: **a provider DEFINITION (the
command) lives in a registered artifact (`.vigiles/providers/`, stamped like a
hook), referenced by name** — never an inline command string inside the pure
`decide`. That's what keeps `decide` pure AND keeps capability = _declared_
surface, even for obscure long-tail tools. Many hooks can reuse one provider by
name (Gatekeeper reuses a Provider across constraints).

## Coverage: every real-world hook maps to a tier (the "all use cases" proof)

Grounded in the 10-OSS dogfood from `research/hook-modes-and-testing.md`. The
point: NOTHING is stranded — where the typed lane doesn't reach, an explicit
opt-out does.

| Real use case (OSS source)                                                           | Covered by                                                                                                                                |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Block dangerous bash (rm -rf / force-push, incl. compound)                           | Tier 0 (`runs`)                                                                                                                           |
| Block secret read (`.env`, `~/.ssh`)                                                 | Tier 0 (`touches`)                                                                                                                        |
| Block `curl \| sh`                                                                   | Tier 0 (`pipesToShell`)                                                                                                                   |
| Block edit to a protected path                                                       | Tier 0 (file-gate `under`)                                                                                                                |
| Validate / block a user prompt                                                       | Tier 0 (`definePromptGate`, shipped)                                                                                                      |
| Stop-gate until tests pass                                                           | Tier 0 (`defineStopGate`, shipped)                                                                                                        |
| React on tool failure                                                                | Tier 0 (`e.response`, shipped)                                                                                                            |
| **Block push to `main` / decide on git state**                                       | **Tier 1** (`git.branch`)                                                                                                                 |
| **Decide on a project-specific tool (kubectl ctx, a custom CLI, an obscure linter)** | **Tier 2** (declared provider)                                                                                                            |
| Auto-format / lint on write; structured logging; TTS/notify                          | react `run("./script.sh")` — call OUT to a script file (thin + analyzable)                                                                |
| **Inject DYNAMIC context (git status, open issues)**                                 | **Tier 2** (a read-only provider feeds an inject)                                                                                         |
| **Rewrite / transform a prompt** (not just block)                                    | **Tier 3** — a gate denies, it doesn't transform; a hand-written UserPromptSubmit hook emits the rewrite                                  |
| **PermissionRequest auto-allow read-only**                                           | **Tier 3** today (no typed role/event yet — candidate future role)                                                                        |
| **Stateful — rate-limit / token-approval / ordering**                                | a read-only provider over a `.vigiles/state` ledger to DECIDE + a react to WRITE it; or the `guards.ts` ordering prototype; or **Tier 3** |
| Arbitrary I/O to decide (call a live service)                                        | **Tier 2** (declared, `dangerously`) or **Tier 3**                                                                                        |

**Thesis: total coverage with graceful degradation.** Because Tier 3 is
Turing-complete and always available, there is no real-world hook vigiles cannot
express. The typed lane maximizes the _analyzable_ fraction; the opt-outs
guarantee it's never a wall. You always know which rung you're on, and the
capability-diff says so.

## Honest caveats (kept in the public guide too)

- **TOCTOU.** Provider facts are gathered just before `decide`; a racing change
  between gather and the real tool call is possible. Tiny window for PreToolUse;
  documented, not papered over.
- **Providers should OBSERVE, not mutate.** A side-effecting provider is a smell
  (a "fact-gatherer" that changes the world). Effect-classify via `bash-effects`;
  read-only by default, side-effecting requires the loud `dangerously` opt-out.
- **State is a second axis.** The provider model gathers stateless READS. Stateful
  gating (rate-limit, ordering) needs a read-provider over a ledger + a writer, or
  the `guards.ts` prototype — noted, not in v1.
- **Each built-in provider is trusted surface vigiles maintains** (like a dialect
  fact). Keep the set SMALL and high-value (the disaster-catalog discipline); push
  the long tail to Tier 2 rather than growing the built-in list.
- **Delivery floor unchanged.** #34692 still bypasses any PreToolUse hook for a
  subagent's tool calls — providers don't change that; a gate is a strong default,
  never an unbypassable wall.

## Build order

1. **v1 — built-in providers (Tier 1). ✅ SHIPPED (2026-06-23).** A closed
   `needs` / `e.ctx` set: `git.branch`, `git.isDirty`, `cwd`. Typed so undeclared
   access is a `tsc` error (the gate generics in `src/core/hook-program.ts`); an
   unknown provider name won't compile. Registry + the injected-IO gatherer in
   `src/core/hook-providers.ts` (a SOUNDNESS test asserts every built-in command
   is read-only via `bash-effects`); the runtime gathers via `execSync` in
   `cli.ts` (`gatherHookContext`). Tested pure (`hook-providers.test.ts`,
   `hook-program.test.ts`) + E2E in a real git repo (`hook.test.ts` — deny push on
   `main`, allow on a branch). Harness-neutral (gather + the exit-2 decision).
2. **v2 — user-declared providers (Tier 2).** `defineProvider` registered under
   `.vigiles/providers/`, stamped like a hook; effect-classified; `dangerously`
   opt-out for a side-effecting one. Capability-diff lists declared providers.
3. **Defer:** parameterized providers (`file.exists(path)`, `file.contains(…)`),
   the stateful axis (ledger providers), and any new typed role for
   PermissionRequest / prompt-rewrite — all Tier 3 until demand is proven.

Per `prefer-existing-solutions`: ADOPT the pattern (pure policy + host-gathered
context + closed-then-declared provider registry — the unanimous design); BUILD a
small vigiles-native provider set, justified because no external lib fits a CC
hook runtime and it reuses machinery we own (`bash-effects` + the event/`needs`
typing). Not a new dependency.

## Sources

- [OPA — External Data](https://www.openpolicyagent.org/docs/external-data)
- [Cedar — Entities & context](https://docs.cedarpolicy.com/auth/entities-syntax.html)
- [Gatekeeper — External Data](https://open-policy-agent.github.io/gatekeeper/website/docs/externaldata/)
- [permit.io — Loading external data into OPA: the good, the bad, the ugly](https://www.permit.io/blog/load-external-data-into-opa)

## See also

- `research/hook-modes-and-testing.md` — the modes (observe) + the gate-role / event-shape coverage analysis this extends (deliverable #7, the generic `tool_input` / external-state piece).
- `research/hook-pain-points.md` — the verified failure corpus + the compiled-hooks ship record.
- `docs/compiled-hooks.md` — the public guide (the "if vs command → which lane" + provider ladder belongs here once built).
