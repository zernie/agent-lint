# Safety — vigiles runs untrusted code, and a real model that decides

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
import { measure, notTool } from "vigiles/eval";

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
