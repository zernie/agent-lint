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
