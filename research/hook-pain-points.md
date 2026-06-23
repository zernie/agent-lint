# Hook pain points — the verified failure corpus + the killer feature

> Internal research (2026-06-22). Five parallel web-research passes over the
> `anthropics/claude-code` issue tracker, official docs, dev.to/Medium experience
> reports, HN, and CVE write-ups. Every issue number below was fetched/verified;
> unverified items are marked. Companion to `research/harness-protocol-flow-moat.md`
> (the reliability-runtime moat) — this is the demand evidence under it.

## The one convergent pain: FALSE CONFIDENCE

Across all five passes, the biggest, most-expensive, most-_verified_ hook problem is
not "the hook won't fire" — it's **the hook looks like a guardrail and silently
isn't one.** A developer ships a safety hook, believes they're protected, and finds
out otherwise only when the agent force-pushes to main.

- **exit 1 vs exit 2** — the single highest-frequency _real incident_. Only exit 2
  blocks; exit 1 is a non-blocking error and execution continues (official docs
  confirm, inverting Unix convention). Crosley: _"I have seen this mistake in three
  different teams' hook configs, each of which believed they had blocked force
  pushes."_ Yurukusa (108h autonomous run): _"one accidental `git push origin main`…
  lost a day."_ Issue #24327 (exit-2 also makes Claude _stop_ instead of
  self-correcting — intermittently).
- **PreToolUse decision silently ignored** — `approve:false` does nothing (#4362,
  assigned bug); wrong JSON field per event (`hookSpecificOutput.permissionDecision`
  for PreToolUse vs top-level `decision`) → block is a no-op.
- **PostToolUse used for blocking** — the tool already ran (3 sources).
- **Silent config failures** — wrong settings.json location, matcher case
  (`bash` ≠ `Bash`, `mcp__memory` matches nothing — needs `mcp__memory__.*`), missing
  `chmod +x`, `$HOME`/`${CLAUDE_PLUGIN_ROOT}` not expanded, missing `jq`, shell-profile
  stdout polluting the JSON channel. All produce a no-op with no error surfaced.

The meta-theme, in the words of multiple tutorials: _"Most hook problems don't throw
errors — they just silently fail, leaving you thinking you're protected when you're
not."_

### The thesis, validated by the ecosystem (and declined by the platform)

Community RFC **#45427** (closed **not planned**) states the whole reliability thesis:

> _"PreToolUse hooks are the only enforcement mechanism, but they fail silently, can
> be bypassed by subagents, and can be rewritten by the model itself."_

Anthropic closing it "not planned" is the opening: the pain is real, named, and the
platform isn't fixing it.

## The killer feature: PROVE YOUR GUARDRAIL ACTUALLY BLOCKS

Feed the _disaster event_ (`git push --force`, `rm -rf /`, `git commit --no-verify`,
`cat ~/.ssh/*`, `curl … | sh`) to the user's hook and assert the decision is BLOCK.
Reuses machinery we already shipped: `runHook` (src/run-hook.ts) + `decideHook` (which
encodes CC's exact exit-2 / `permissionDecision:deny` semantics) + `assertHookBlocked`
(src/harness-assert.ts). Deterministic, model-free, CI-runnable.

Proven receipt (2026-06-22), two byte-identical-looking guards:

```
fake-guard.sh   exit=1  →  ❌ DOES NOT BLOCK (false confidence!)
real-guard.sh   exit=2  →  ✅ ACTUALLY BLOCKS
```

It catches the entire false-confidence cluster: exit-1, wrong JSON field, wrong jq
path, chmod/jq failures, PostToolUse-can't-block, shell-profile pollution — every one
shows up as "fed the disaster, didn't block."

## How it works — VERIFY, not COMPILE, not GATE

The feature is fundamentally the **TEST tier**, not the compile tier. That is a
deliberate design choice for three reasons:

1. **Zero adoption tax.** It must work on the hand-written shell hooks people _already
   have_ — no vigiles spec, no compile, no rewrite. `runHook(theirHookCommand,
disasterEvent)` works on any hook regardless of authoring.
2. **It sidesteps CC's runtime bugs.** We verify the hook's _decision logic_, so we
   don't depend on CC firing the hook correctly in prod.
3. **Honest scope.** We claim "your guardrail's logic is provably correct," never
   "your hooks can't be bypassed."

Mechanism (deterministic, no model):

1. **Discover** hooks via `loadPlugin` (settings.json / plugin.json / hooks.json), the
   `${CLAUDE_PLUGIN_ROOT}` token resolved — same read `scan` already does.
2. **Run** each PreToolUse (and relevant) hook through `runHook` against each event in
   a curated **disaster catalog**, under CC's real restricted PATH (also catches the
   rtk#685 PATH-strip silent-failure class).
3. **Decide** via `decideHook` (exit code + JSON → blocked|allowed).
4. **Report** per hook × per disaster: blocks / doesn't → flag the false-confidence
   no-ops.

### Where compile / the typed ladder fits (optional, on top)

The "via compile?" answer is: **compile is the optional Level-2 upgrade, not the
mechanism.** Mirrors vigiles's existing markdown→spec ladder:

- **Level 0 (no buy-in):** run the battery on existing hooks → an informational
  _coverage map_ ("here's what your hook blocks from the standard dangerous set"). No
  pass/fail (avoids flagging a hook that was never meant to block force-push).
- **Level 1/2 (declared intent):** the user states what a hook is _supposed_ to block
  (a `hook()` spec's declared `protects:` set, or an `assertHookBlocked` in a test). Now
  it's pass/fail in CI. Here **`scaffold-test` is the ergonomic surface**: point it at a
  safety hook → it auto-generates the `runHook` assertions from the catalog → a CI test.
  And IF the hook is itself compiled from a typed `hook()` spec (see the
  hook-spec spike, `src/core/hook-spec.ts`), compile can emit the hook AND its
  verification test together, intent derived from the spec.

So: **test-first (works on everyone's hooks today), compile-optional (derives the test
from declared intent for typed-spec users).** The compile layer makes intent explicit
and the proof automatic; it is never a prerequisite.

### Compiled-hooks PROBE — DONE (2026-06-22, `bd33aa4`)

`src/core/hook-program.ts` + a 5-claim test prove the **constrained-API** model (a hook =
a pure typed `(event)=>Decision` against a closed `vigiles/hook` vocabulary, vigiles
compiles it). All five hold in-process, no subprocess, no model:

1. **Testability** — `decide` is pure, unit-tested directly; the false-confidence protocol
   (exit 1≠2, JSON field) is UNREPRESENTABLE (compiler emits exit-2).
2. **AST matching** — `command.runs("git push",{force})` via new `bash-effects.leafCommands`
   (AST leaf extraction) catches the compound bypass `cd x && git push -f` the native glob
   (#30519) misses AND avoids a `grep` false-positive on `echo "...git push..."`.
3. **Compiles** to a real CC hooks block.
4. **Capability = API surface** — `checkHookImports` rejects any import outside `vigiles/hook`
   (+ eval/Function/dynamic-import); an out-of-API hook does NOT compile.
5. **Stamping** (the "fix #4" idea, integrity.ts pattern) — `stampHook`/`verifyHookStamp` make
   the artifact tamper-evident: a hand-edit smuggling `child_process` breaks the stamp.

So claim #4 has TWO layers: static import-boundary at compile + a tamper-evident stamp at
runtime. Honest limits unchanged: buy-in (rewrite as a typed program), node-startup latency,
and CC delivery bugs (#34692) still bypass any compiled hook — compile fixes AUTHORING +
ANALYSIS, not delivery. Verdict: the model is real and coherent ("a hook becomes a formal
object"); the open question is whether the `vigiles/hook` API stays minimal-but-sufficient
for real hook shapes.

**PROBE 2 — vocabulary holds across two more shapes (2026-06-22, `3c00be5`).** Widened to a
path-confine GATE (Edit/Write, a `PathView.under()` matcher — different tool/field/matcher,
extends cleanly) and a context-INJECTION hook (SessionStart, returns `Injection` text, not a
Decision). Finding: the vocabulary holds, and it's a small **FAMILY keyed by hook ROLE**
(gate vs inject) whose per-role OUTPUT TYPE eliminates two MORE verified pains by construction:
(a) the compiler emits the RIGHT JSON field per role (`additionalContext` for inject vs
exit-2/`permissionDecision` for a gate) — the wrong-field pain vanishes; (b) an inject hook
CANNOT return `deny()` (tsc error, build-enforced via @ts-expect-error) — so "block on a
SessionStart/PostToolUse hook" (a documented mistake) is a TYPE error, not a silent no-op.

So the model strengthens as it widens: each hook ROLE is a typed kind, and the wrong-output
bugs become unrepresentable.

**PROBE 3 — react/PostToolUse completes the family (2026-06-22, `890aa3e`).** A react hook fires
AFTER the tool ran (can't block) — its job is to DO something (format/recompile/warn), so this
is where side effects RE-ENTER (gate + inject are pure). The constrained API keeps them
BOUNDED: a react returns a typed `Reaction` whose `run(cmd)` is EFFECT-CLASSIFIED at construction
(`RunReaction.effect` via bash-effects), so even the side-effecting role stays ANALYZABLE — you
can list/diff exactly what every react runs and its effect. And a react still CANNOT `deny()`
(tsc error) — "block on a PostToolUse hook" (the documented mistake) is unrepresentable.

**The family is now complete and the thesis holds across all three roles:**

- `gate` (`decide` → `Decision`, PURE) — PreToolUse allow/deny/ask;
- `inject` (`produce` → `Injection`, PURE) — SessionStart/UserPromptSubmit context text;
- `react` (`react` → `Reaction`, BOUNDED side effects) — PostToolUse classified action.

Each role's OUTPUT TYPE makes its wrong-output bug class impossible to write (exit-code, wrong
JSON field, block-on-wrong-event), and the side-effecting role is bounded+classified, not
arbitrary. Verdict: the closed `vigiles/hook` vocabulary is SOUND across the real hook shapes.
The remaining questions are NOT "does it cover the shapes" (it does) but the adoption economics:
buy-in (rewrite hooks as typed programs) vs. node-startup latency vs. payoff, and whether to
promote `vigiles/hook` to a public authoring API + a real bundler/`run-hook-program` runtime.

## Honest boundary — the CC delivery bugs we CANNOT fix

Verifying decision logic does not fix CC's runtime _delivery_ holes. Flag them by
issue number; never claim to fix them:

- **Subagents bypass all PreToolUse hooks** (#34692, closed not-planned; #25000,
  #23983) — a verified-correct guard still won't fire for a subagent's `git push`.
  This also undermines any runtime-GATE ambition, incl. our own guard-hook (itself a
  PreToolUse hook). The reason **verify > gate** here.
- **exit-2 ignored for Edit/Write**; **MCP calls unblockable** by hooks (boucle2026).
- **Model rewrites its own hook** / routes around Write via Bash heredoc (#45427, #32376).
- **Env-conditional non-fire**: `-p`/non-interactive (#40506, closed not-planned),
  VSCode/Cursor (#16114), subdirectory (#8810), worktree (#46808), ~2.5h degradation
  (#16047), Stop-hook-in-SKILL.md (#19225).
- **`${CLAUDE_PLUGIN_ROOT}` not injected at hook exec time** (#24529/#43380 cluster,
  v2.1.83 regression #38699) — resolves to `/hooks/…`, the hook silently never runs.

## Security context (verified CVEs)

- **CVE-2025-59536** (8.7 HIGH, fixed 1.0.111): hooks + MCP in a repo's
  `.claude/settings.json` execute _before_ the trust dialog → RCE on clone+open.
- **CVE-2026-21852** (fixed 2.0.65): `ANTHROPIC_BASE_URL` from a repo read before
  trust → API-key exfiltration.
- Deeplink RCE (`claude-cli://` injects hook settings, fixed 2.1.118; no CVE assigned).

These reinforce "a hook is arbitrary shell = a footgun," but they're platform bugs
(patched) — context, not something the verify feature addresses.

## Verdict

"Prove your guardrail actually blocks" clears every bar earlier hook ideas failed:
verified top-pain (real force-push incidents, 3 teams, a not-planned RFC), existing
machinery (runHook/decideHook/assertHookBlocked), deterministic + free + CI, a sharp
one-liner ("your force-push guard probably doesn't work — prove it does"), and it
dodges CC's runtime bugs by verifying logic instead of delivering enforcement.

Smallest real build: a curated disaster-event catalog + the `scan`/`scaffold-test`
surface over it, dogfooded on a real OSS safety hook to find one that's secretly a
no-op. See `research/harness-protocol-flow-moat.md` for the moat framing and
`research/roadmap.md` for sequencing.

## Status — SHIPPED v0 (2026-06-22, `a5abf70`)

`src/guardrail-check.ts` on the `vigiles/unit` surface: `DISASTER_CATALOG` (force-push
incl. compound, `reset --hard`, `rm -rf`, `--no-verify`, ssh-key read, `curl | sh`) +
`verifyGuardrail` (feeds each via `runHook`) + `assertBlocksDisasters` (the CI gate) +
`formatGuardrailReport`. Wired into `scaffold-test` (a hook scaffolds the runnable
battery). Committed receipt: an exit-1 fake guard vs an exit-2 real one are told apart.

**Design lesson from dogfooding (the load-bearing one).** Running the battery on our own
`pre-edit.sh` reported "blocks 0/7" — _correct but misleading_: that hook protects compiled
`.md` files, it was never a bash-safety guard. So the coverage map MUST be **neutral** (report
what's blocked, judge nothing), and the **"false confidence" verdict only fires once intent is
DECLARED** (`assertBlocksDisasters(cmd, { categories })`). Two levels, by design:

- **Level 0 — coverage map:** neutral facts, zero buy-in, no false positives ("a hook that
  allows these may simply not be a bash-safety guard").
- **Level 1 — declared-intent gate:** the user states the categories the hook is responsible
  for → a miss is a real CI failure. This is the only place "false confidence" is asserted.

This is the false-positive discipline (don't-cry-wolf) that the whole tool lives or dies on,
learned the moment we pointed it at a real hook with a different purpose.

**Real-plugin dogfood — DONE (2026-06-22).** Ran the battery against
`disler/claude-code-hooks-mastery` (a popular, widely-copied "Claude Code hooks" reference
repo) `pre_tool_use.py`. It is correctly coded (exit 2) and blocks its declared domain —
`rm -rf` ✅ and `.env` access ✅ — but is a **NO-OP against 5/7 of the battery**: force-push,
force-push-compound, `reset --hard`, `--no-verify`, private-SSH-key read (`cat ~/.ssh/id_rsa`),
`curl | sh`. The sharp finding: its own docstring says it "blocks access to sensitive
environment files," yet a **private SSH key read sails through** — it protects one class of
secret (`.env`) and misses another (`~/.ssh`). This is the adoption demo: a stranger's
real safety hook, with its exact blind spots shown deterministically (and FAIRLY — the
neutral map says "allows," not "broken"; the gap is real but the hook isn't lying, it just
has a narrower scope than a copier assumes).

**NEXT:** a `scan` coverage column (surface this on any repo with a PreToolUse hook); vendor a
licence-clean slice as a golden regression fixture; publish the finding as the adoption artifact
("your installed safety hooks don't stop these 5 things").

## COMPILED HOOKS — SHIPPED (2026-06-22, `c4d4d85`)

Beyond verifying a hook's logic, vigiles now lets you AUTHOR a hook that can't be wrong.
`vigiles/hook` (core `src/core/hook-program.ts`, public `src/hook.ts`) + the CLI
(`compile-hook` / `run-hook-program`) ship the constrained-typed-program model the earlier
probe validated: a pure `(event) => Decision` against a closed vocabulary, compiled to the
harness protocol. The role FAMILY (gate/inject/react) + the AST matcher
(`command.runs`/`touches`/`pipesToShell`) + capability-check + tamper-evident stamp make whole
bug classes UNREPRESENTABLE. Public guide: [`docs/compiled-hooks.md`](../docs/compiled-hooks.md).

**Compiled-hook OSS dogfood (the "prove worth" artifact), DONE.** `src/hook-dogfood.test.ts`
turns the disler finding above into a runnable, model-free regression: a faithful substring
guard (the widely-copied hand-written shape) misses 5/7 of `DISASTER_CATALOG`; the compiled
rewrite ([`examples/harness/safe-bash-guard.mjs`](../examples/harness/safe-bash-guard.mjs))
blocks **7/7** by construction — same intent, no blind spots, no protocol bug. The two API
additions the full intent needed (`touches` for secret reads, `pipesToShell` for `curl | sh`)
stayed high-signal (a shell _with_ a script file is not flagged).

**Honest scope (unchanged):** compile fixes AUTHORING + LOGIC, not DELIVERY — #34692 still
bypasses any PreToolUse hook. A gate is a strong default, never an unbypassable wall.

### Compiled-hook dogfood coverage matrix (per capability)

Every public `vigiles/hook` capability and how it's proven. **E2E** = drives the real
built CLI runtime (`node dist/cli.js hook-runtime run-program <fixture>`) over `runHook`,
no model; **unit** = pure in-process (`hook-program.test.ts`); **OSS** = grounded in a real
external artifact. The deterministic tiers are the floor; the apex (does a hook FIRE in an
assembled session) is the runHarnessTest tier, capped by #34692.

| Capability                                                             | Tier          | Where                                                                                                                              |
| ---------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Bash **gate** (`defineHook`) + `runs`/force, `touches`, `pipesToShell` | E2E + **OSS** | `hook.test.ts`, `hook-dogfood.test.ts` (disaster battery; 7/7 vs the disler shape's 2/7)                                           |
| **file-gate** (`defineFileGate` + `PathView.under`)                    | **E2E**       | `hook.test.ts` — deny a Write under `dist`/`.vigiles`, allow elsewhere                                                             |
| **inject** (`defineInject`)                                            | **E2E**       | `hook.test.ts` — emits `additionalContext` (the right field)                                                                       |
| **react** (`defineReact` → `notice`/`run`/`nothing`)                   | **E2E**       | `hook.test.ts` — a notice reaches stderr + can't block (exit 0); `run()` executes its effect-classified command                    |
| **capability check** (import outside `vigiles/hook` won't compile)     | E2E           | `hook.test.ts` — `compile <evil.mjs>` exits 1                                                                                      |
| **tamper stamp** (hand-edit → runtime refuses)                         | E2E           | `hook.test.ts` — fail-closed exit 2                                                                                                |
| **compile → merge** into native config                                 | **OSS**       | `hook.test.ts` — merges into the real superpowers `hooks.json`, non-destructive + idempotent; pure merge in `hook-install.test.ts` |
| **multi-harness emit** (Codex TOML `[[hooks.<event>]]`)                | E2E           | `hook.test.ts` — `compile --harness=codex` + the inject/react deferred-output warning                                              |
| category mistakes (inject/react can't `deny`)                          | unit (tsc)    | `hook-program.test.ts` — two `@ts-expect-error`                                                                                    |

**Deliberate non-coverage, with reasons (not backlog):**

- **Gate "golden before" stays a faithful RECONSTRUCTION, not a vendored file.** The canonical
  disler `pre_tool_use.py` is UNLICENSED — vendoring it would violate its (absent) licence, so
  the committed regression reproduces its shape (`NAIVE_GUARD`) while the real 2/7 measurement
  is recorded above. An MIT alternative exists (`alexknowshtml/claude-code-safety-hooks`) but
  pulls a `jq` + `/tmp` token-system runtime dependency that would make a committed CI test
  flaky — a bad trade by the don't-cry-wolf bar. Revisit only if a self-contained MIT guard
  with no runtime deps surfaces.
- **inject/react have no deterministic "prove worth" ORACLE** like the gate's disaster battery
  (there's no catalog of "context a good inject must add"), so they're proven STRUCTURALLY
  (the role does its side, the wrong output can't type-check) — not scored. A model-graded
  judgment of inject/react QUALITY is the eval tier's job, not a dogfood's.

**NEXT — multi-harness:** the model is harness-neutral; only the EMIT differs (CC JSON settings
vs Codex TOML `[hooks]`, glob vs regex matcher), and Codex's veto is exit-2-identical so the
runtime is shared. Design: [`compiled-hooks-codex.md`](compiled-hooks-codex.md).
