---
status: shipped
topic: adapters
---

# OpenCode prototype — does the capability tier hold for a non-shell-hook harness?

> An **internal, non-shipped** OpenCode adapter (`src/adapters/opencode/`), built
> after Codex to validate a second thing: that the **`AdapterCapabilities` tier**
> (`src/core/adapter.ts`) correctly models a harness that is mockable for pillar 2
> but whose hooks are **in-process code modules, not shell processes**. Like the
> Codex prototype it is NOT registered (`ADAPTERS`), NOT exported (`vigiles/*`),
> and the CLI never auto-detects it — it exists only to run through the
> conformance kit + real fixtures (`src/adapters/opencode/opencode.test.ts`).
> Built from `research/harness-landscape.md` (OpenCode = sst, the best OSS fit).

## Why OpenCode (and not another Codex)

Codex proved the **format + layout** axes generalize. OpenCode was chosen as the
second prototype because it stresses a _different_ seam: it is the row that
**splits the capability matrix mid-way**.

- **Mockable** — OpenCode runs against any openai-compatible endpoint via a
  base-URL override, so the pillar-2 transport (`harnessTesting`) is reachable in
  principle. Codex-like on this axis.
- **But its hooks are TS/JS plugin modules on an event bus** (`session.idle`,
  `tool.execute.before/after`), **not** shell processes that block via an exit
  code. So the `runHook` unit tier and the `HookProtocol` port **do not apply**.

That combination — `harnessTesting: true`, `shellHooks: false` — is exactly the
case the new capability gating exists for.

## Verdict: the capability tier holds ✅

`opencodeAdapter` declares `{ referenceVerification: true, harnessTesting: true,
shellHooks: false }` and ships **no `hookProtocol`** (and no `hook-protocol.ts`).
The conformance kit accepts it:

- `assertAdapterConformance(opencodeAdapter)` ✅ — passes **without** a
  `hookProtocol`, because `shellHooks:false` relaxes that requirement (and would
  _reject_ a stray `hookProtocol` it disclaims). Before the tier, the kit demanded
  all five ports and this adapter could not exist without a fake hook protocol.
- `assertHarnessTestable(opencodeAdapter)` ✅ — does not throw and hands back
  `runtime` + `modelMock`: OpenCode IS pillar-2-capable, the guard agrees.
- `opencodeAdapter.hookProtocol === undefined` — the blocked port made concrete,
  asserted in the test rather than left implicit.
- `compileAgent(spec, { dialect: opencodeDialect })` ✅ — an OpenCode built-in
  (`bash`) passes; a Claude-Code-only tool (`NotebookEdit`) is flagged. Same
  compiler, injected dialect.
- `loadPlugin(dir, opencodeLayout)` ✅ — a real OpenCode-shaped repo (`AGENTS.md`
  - a `.opencode/agent/` surface) loads through the same layout-driven loader.

So the bet held twice: the format/layout axes generalize (Codex), **and** the
capability descriptor correctly lets a mockable-but-no-shell-hooks harness be a
first-class adapter instead of an impossible one (OpenCode).

## Gaps the prototype concretely exposed

1. **The mockable tier is declared, not yet runnable.** `harnessTesting: true` +
   `opencodeModelMock` name the wire format (`openai-chat`, `/v1/chat/completions`)
   but the **OpenAI Chat-Completions SSE renderer + request parser don't exist**
   (the same shape of gap as Codex's Responses renderer), and `opencode` isn't
   installed here. The format/layout/capability axes are what's provable today.
2. **No hook tier at all for OpenCode.** With `shellHooks:false`, the cheap
   `runHook` unit tier — the base of the testing pyramid — simply doesn't exist
   for OpenCode. Testing an OpenCode plugin hook means driving its event bus
   in-process; that's a _different_ tier the harness-testing pillar does not yet
   have. This is a real capability ceiling, not a missing renderer.
3. **`modelBaseUrlEnv` is the messy half again.** Like Codex, pointing OpenCode at
   a mock is cleaner via its config (`opencode.json` provider block) than a bare
   `OPENAI_BASE_URL`; the `HarnessRuntime.wireMock(baseUrl)` op (deferred from the
   Codex findings) is needed here too — a second harness confirming the shape.
4. **Layout MCP read is JSON here (good) but key differs.** OpenCode's MCP lives
   under an `mcp` key in `opencode.json` (JSON, unlike Codex's TOML table), so the
   layout port's `mcpManifestKey` covers it — but this re-confirms the loader's
   manifest/MCP read must be fully layout-driven (the Codex TOML gap).

## What this means

Two prototypes, two distinct validations: Codex showed the format/layout axes
generalize; OpenCode showed the **capability tier** does its job — relaxing port
requirements for what a harness genuinely can't do, instead of forcing a fake
transport or hook protocol. To actually _ship_ OpenCode pillar-2 support: build
the Chat-Completions SSE renderer + the `wireMock` op (gaps 1, 3), and accept that
the shell-hook unit tier will never apply (gap 2) — OpenCode plugin-hook testing
is a separate, future tier.

The boundary holds for this prototype too: `src/adapters/opencode/**` is an
`opencode-harness` element in `eslint.config.mjs`, and `verify-core` may import
neither it nor the other adapters.

## See also

- `research/codex-prototype-findings.md` — the first prototype (format+layout axes).
- `research/harness-landscape.md` — the landscape table + why OpenCode is the best
  OSS fit, and the mockability gate that splits pillar-2-capable harnesses.
- `docs/harnesses.md` — the user-facing capability matrix this grounds.
