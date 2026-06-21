# Safety — vigiles runs untrusted code, and a real model that decides

> **Status: INTERNAL / WIP — not surfaced in the public docs yet.** The shipped,
> solid pieces are host **confinement** (bubblewrap + egress — see
> [`sandboxing.md`](sandboxing.md)) and the eval-tier **`interceptTools`**
> side-effect prevention. The deterministic _authoring-side_ safety model it ties
> together (the `purity` floor + the **parked** `effect()` sub-region — see
> [`../research/effect-boundary-design.md`](../research/effect-boundary-design.md))
> is still settling, so this "safety model" front door isn't linked from the README
> until it's coherent end-to-end. Read it as the design intent, not a finished guarantee.

Testing a harness means **executing other people's code with your privileges**,
and — at the eval tier — letting a **real model decide which tools to call**. Both
are deliberate (that's the point: test what actually ships), and both are risks.
This is the honest, end-to-end account of what vigiles protects, what it doesn't,
and the one rule that makes it safe by default.

For the deep mechanics of host confinement, see
[`sandboxing.md`](sandboxing.md); this doc is the front door that ties the whole
model together, including the part `sandboxing.md` doesn't cover — preventing a
**real model's tool side effects** during an eval.

## Two distinct risks → two distinct mechanisms

|                       | The risk                                                                                        | The mechanism                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Foreign code**      | A hook / plugin / skill you test runs with your privileges — it can read, write, phone home.    | **Confinement** — bubblewrap (`bwrap`): no egress, read-only `/`, cleared env.     |
| **A model's actions** | At the eval tier a _real_ model can **decide** to `git push`, hit a paid API, spawn a subagent. | **Interception** — a `PreToolUse` hook **denies** the matched call before it runs. |

They compose: an eval of an untrusted plugin gets **both** — the plugin code is
confined, and the model's tool calls are intercepted.

## Running is itself a side effect — ephemerality (orthogonal to trust)

Confinement answers _"can this code touch my host?"_ — but it misses a second,
independent question: **does _running_ it change my state?** A skill or agent is
**model-driven**: even a plugin _you wrote_, the model decides the actions,
nondeterministically. "I trust the code" ≠ "running it is safe to do in my real
working tree." So there are **two orthogonal questions**, not one:

| Question                                                | Governed by                                                               | Mechanism                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| **Host protection** — can it read my secrets/escape?    | **provenance** (yours → direct, foreign → confined)                       | bwrap (Linux); Seatbelt (macOS, planned) |
| **State protection** — does running it mutate my world? | **always ephemeral** (trust is irrelevant — the _model_ chose the action) | disposable env + interception            |

Provenance lets you skip _confinement_; it does **not** let you skip
_ephemerality_. Side effects sort by **reversibility**, which decides the layer:

| Side effect            | Example                     | Layer                                               | Cross-platform?                                      |
| ---------------------- | --------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Local, reversible      | file edit, local commit     | **ephemeral CWD** (discard the temp dir)            | ✅ done (`mkdtemp` per run)                          |
| Local, escapes CWD     | write `~/.gitconfig`, `~/…` | **ephemeral HOME + scrubbed env**                   | ✅ cheap — **gap on the direct path today**          |
| External via network   | `git push`, paid API, exfil | **deny-all / allowlist net** (bwrap+nft / Seatbelt) | ⚠️ Linux today (bwrap+nft); macOS planned (Seatbelt) |
| Irreversible, specific | push to prod, charge a card | **`interceptTools` deny / `notTool` assert**        | ✅ harness-layer                                     |

The last row is why ephemerality alone isn't enough: you can throw away a temp
dir, but you **can't un-push or un-charge** — those escape any box and need
interception or a network wall.

**Where vigiles is today:** every run already executes in a fresh `mkdtemp` temp
dir (`cwd`), so local file writes are contained and discarded — but the
**direct/non-confined path inherits the real `$HOME` and environment**
(`eval.ts`: `env: { ...process.env }`), so a model-driven `git push` / write to
`~` still escapes. Closing it is an **ephemeral run environment** (throwaway HOME +
scrubbed env) for every model-driven run, trusted or not — with one nuance: a
real-model eval still needs the harness's _own_ auth (`~/.claude` /
`ANTHROPIC_API_KEY`), so it's "fresh HOME with **only** the harness credential
injected," not a blanket wipe. **Status: shipped but opt-in today** (`ephemeralEnv:
true`; default **off**, so existing evals authenticate byte-identically to before).
Making it the **default** is the committed next step — gated only on validating the
file-based OAuth (`~/.claude/.credentials.json`) copy path against a real local
credential; the env-var/host-brokered auth path is already proven. The pure pieces
(`ephemeralRunEnv` / `seedEphemeralHome`) and the scrubbed-env wiring are unit-tested
(`eval.test.ts`). This needs **no kernel features**, so it lands on macOS immediately,
independent of the Seatbelt backend. Tracked in
[`research/cross-platform-sandboxing.md`](../research/cross-platform-sandboxing.md).

## The one rule: safe by default, never silently unconfined

`decideSandbox` ([`src/sandbox.ts`](../src/sandbox.ts)) is the whole policy, and
it is **fail-closed**:

- **Untrusted** code — anything with a `plugin`/`pluginDir`, or `runHook` with
  `trusted: false` — is **confined, or the run refuses**. If no sandbox is
  available (non-Linux, hardened userns), `decideSandbox` _throws_; it never
  falls back to running foreign code in the open.
- **Trusted** code — inline `settings`/`files` you authored — runs direct, because
  committing it was already a trust decision (the same one you make taking on a
  dependency).
- `sandbox: false` is the **only** way foreign code runs unconfined, and it's an
  explicit opt-out (e.g. you're already inside a disposable CI container — see the
  tier table in [`sandboxing.md`](sandboxing.md)).
- `sandbox: "strict"` forces confinement even on trusted code, when you want
  belt-and-suspenders.

> **Why not just confine _everything_?** Because it would break more than it
> protects: confinement is Linux-+-userns only (forcing it turns a hook _you wrote_
> red on every Mac and hardened runner), the sandbox is deliberately hostile (no
> env, no net, read-only — a trusted hook that needs any of those now fails for
> reasons unrelated to its logic), and it's not free (the unit tier's whole value
> is a millisecond `spawnSync`). The full four-reason argument is in
> [`sandboxing.md` § "Why confinement is opt-in"](sandboxing.md#why-confinement-is-opt-in-not-always-on).

## What confinement actually prevents (and doesn't)

Under `bwrap` a confined run gets a fresh user/net/pid/mount namespace,
`--ro-bind / /` (read-only host), a throwaway writable work dir, and `--clearenv`.

- **Destruction: strong.** `rm -rf ~`, `rm -rf /etc` → `EROFS`. The worst it can
  delete is its own scratch dir.
- **Env secrets: cleared.** `ANTHROPIC_API_KEY` and friends aren't visible.
- **Network: a real wall.** Deny-all by default; the scripted mock is co-launched
  _inside_ the namespace so it stays reachable while egress is blocked.
  `recordEgress` records what proxy-honoring tools _try_ to reach (while still
  blocking); `egress: { allow }` lets traffic out to an allowlist and drops the
  rest **at the packet layer** (`nft`, so even a raw socket off-list is dropped).

**Honest gaps** (also flagged in `sandboxing.md`):

- **Reading the host FS is _not_ isolated** — the read-only `/` mount means a hook
  can `cat ~/.ssh/id_rsa`. What saves you is egress being blocked: it can read but
  can't send. (A future `strictFs` minimal-rootfs mode closes this, at a
  compatibility cost.)
- **DNS rotation** in the `egress` allowlist (IPs resolved at launch) — the
  resolver-pinned layer is the next step ([`sandbox-network.md`](../research/sandbox-network.md)).
- **Not a kernel sandbox.** This defends against careless/malicious _plugin_ code,
  not a kernel or unprivileged-userns exploit — `bwrap` leans on the same userns
  primitive Docker-rootless does. Out of scope.

## Preventing a model's side effects — `interceptTools` / `notTool`

A real-model eval is the one place code you didn't write — the _model_ — chooses
what to do. To test "the agent **didn't** push to `main` / call a paid API / spawn
a paid subagent" **safely**, vigiles intercepts the tool:

```ts
import { measure, notTool } from "vigiles/testing";

const report = measure(spec, {
  trials: 5,
  // Intercept the dangerous tool: the model can DECIDE to call it; it never runs.
  interceptTools: [
    {
      tool: "Bash",
      when: { command: /git push/ },
      denyReason: "blocked in test",
    },
  ],
  checks: [notTool("Bash", { command: /git push/ })], // assert it never (successfully) pushed
});
```

**This is intercept-and-_prevent_, not a faithful mock.** A `PreToolUse` hook
denies the matched call (exit 2); the `tool_use` — with its arguments — still lands
in the `Trace`, so `notTool`/`toolWith` can assert on the **attempt**. The model is
told the call was _blocked_, not that it _succeeded_.

- ✅ **Sound for:** "did the agent _attempt_ X?" — safety gates, approval checks,
  "no paid call", "no push to the wrong branch". `notTool` is the **negative
  safety assertion** a completion-grading eval structurally can't make: it sees the
  agent's _decision to act_, not just its final text.
- ⚠️ **Not for:** stubbing a tool to return a fake success and letting a multi-step
  flow continue — the model sees a block, so a sequence that needs the real result
  breaks. (Claude Code has no "skip-but-return-success" primitive for arbitrary
  tools; deny is the closest safe thing.)

**Testing that an enforcement gate actually holds** — including under an adversarial
prompt that asks the agent to skip it — is done with `notTool` + `output` checks in
`measure`. The worked dogfood is
[`examples/harness/dogfood/adversarial-gate.eval.mjs`](../examples/harness/dogfood/adversarial-gate.eval.mjs).
When that eval shows a prose gate can be talked out of, the deterministic
`PreToolUse` hook is the fix — see the eval→enforce bridge note in
[`eval-architecture.md`](eval-architecture.md#the-adversarial-gate-test--worked-example-and-the-evalenforce-bridge).

## At a glance — what's confined, per tier

| Tier             | Foreign code       | Model's tool calls    | Default                                          |
| ---------------- | ------------------ | --------------------- | ------------------------------------------------ |
| `runHook`        | confine-or-refuse¹ | — (no model)          | trusted → direct; `trusted:false` → confined     |
| `runHarnessTest` | confine-or-refuse¹ | — (scripted mock)     | inline → direct; `plugin`/`pluginDir` → confined |
| `runEval`        | confine-or-refuse¹ | `interceptTools` deny | plugin confined; interception is opt-in          |

¹ via `decideSandbox` — `sandbox: false` is the explicit unconfined opt-out;
`sandbox: "strict"` forces it on trusted code too.

## See also

- [`sandboxing.md`](sandboxing.md) — the confinement deep dive: tiers, the
  opt-in-not-always-on argument, `recordEgress`, `egress: { allow }`, dogfood findings.
- [`harness-testing.md`](harness-testing.md) — the three tiers and where the
  boundary sits.
- [`eval-architecture.md`](eval-architecture.md) — `interceptTools`/`notTool` in the
  eval design, with the intercept-≠-mock trade-off.
- [`src/sandbox.ts`](../src/sandbox.ts) · [`src/egress.ts`](../src/egress.ts) ·
  [`src/tool-intercept.ts`](../src/tool-intercept.ts) — the pure, tested seams.
