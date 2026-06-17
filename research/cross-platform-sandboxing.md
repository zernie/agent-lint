# Cross-platform sandboxing — decision + survey

> Status: **decided** (2026-06-17). Mac support is a hard requirement (a large
> share of the dev population). This doc records the build-vs-adopt survey, the
> `claude`-binary finding, the chosen design, the enabled/disabled model, and one
> parked idea (verify/test the harness's own sandbox config).

## TL;DR — the decision

Confinement becomes a narrow **`vigiles/os-isolation` port** with a **native
backend per OS**, selected by capability probe; nothing outside the port names
`bwrap`/`sandbox-exec`/`nft`:

| OS              | Backend                       | FS                                            | Network                                           | Notes                                              |
| --------------- | ----------------------------- | --------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Linux (+userns) | **`bwrap` (+`nft`)**          | ro-`/`, writable workdir                      | deny-all **or per-host allowlist** (packet-layer) | current; the strongest backend — keep it           |
| **macOS**       | **`sandbox-exec` (Seatbelt)** | deny-default, allow workdir RW + needed reads | **deny-all** (`(deny network*)`)                  | built-in, **zero deps**; small static SBPL profile |
| neither         | **refuse**                    | —                                             | —                                                 | honest floor — never run foreign code unconfined   |

- **Per-host egress allowlist stays a Linux capability.** Seatbelt cannot
  packet-filter per host (even Anthropic's `srt` falls back to a bypassable proxy
  for this). macOS degrades **honestly** to deny-all-net, which covers the real
  threat (foreign code exfiltrating). Per-host-on-Mac is a later, optional add.
- **Hand-roll the macOS backend; do not adopt `srt` now.** Our need is narrow
  (confine a _test_ subprocess), so the SBPL profile is small — not the expensive
  general-purpose profile generation. Hand-rolling avoids a beta dependency, keeps
  the stronger Linux `nft` wall (adopting `srt` would _downgrade_ Linux to its
  proxy), and leaks no implementation detail. **`srt` is the documented fallback**
  if the profile gets hairy or we later want cross-platform per-host egress.
- **Do NOT delegate to Claude Code's built-in sandbox** (see findings) — it covers
  the Bash tool only (not hooks), exposes no external API, and is Claude-Code-only
  (would break the harness-agnostic boundary).

## The enabled/disabled model — provenance, not platform

The recurring confusion ("force it on → breaks trusted hooks + unavailable
platforms; opt-in → Mac is unsafe") dissolves once you see it's **not a global
on/off**. The line is drawn by **who wrote the code**, and it's the same on every
OS:

| What's running                                           | Confined?             | Why                                                                     |
| -------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| **Your own** hooks/settings (inline, authored)           | **No — direct**       | already trusted; confining breaks legit env/net/fs needs _(usefulness)_ |
| **Foreign** code (`plugin`/`pluginDir`, `trusted:false`) | **Yes — or refuse**   | unaudited; the only place safety is earned _(safety)_                   |
| Foreign, `sandbox:false`                                 | No — explicit opt-out | you took responsibility (audited / disposable host)                     |
| Anything, `sandbox:"strict"`                             | Yes                   | belt-and-suspenders                                                     |

Safety and usefulness **apply to different code**, so they don't trade off: your
own code is never punished; foreign code is never silently unconfined. The default
is both.

**The Mac gap is not a hole in this rule** — it is that, with no macOS backend, the
"Yes — or refuse" cell has only two outcomes on a Mac: _refuse_ (safe but Mac
can't test plugins → useless) or forced `sandbox:false` (useful but unsafe). The
user is forced to choose. The macOS backend deletes that forced choice — foreign
code is _actually confined_ on Mac, so the cell reads "Yes" everywhere. The fix
doesn't change the safety rule; it makes the safe option **available** so nobody is
pushed to the unsafe one.

## Ephemerality is a separate axis (and it helps Mac most)

Confinement (above) is **host protection** — provenance-keyed (your code direct,
foreign confined). It misses a second, orthogonal axis: **state protection** —
_running_ a skill/agent mutates state, and it's **model-driven**, so even a plugin
you wrote produces nondeterministic side effects. Trust does **not** make a run
side-effect-free. So ephemerality is **unconditional** for model-driven runs,
independent of the confinement decision.

Side effects sort by reversibility → layer:

- **local + reversible** (file edit, local commit) → **ephemeral CWD** (we already
  `mkdtemp` a fresh `cwd` per run and discard it).
- **local but escapes CWD** (`~/.gitconfig`, `~/.ssh`) → **ephemeral HOME +
  scrubbed env**. **Gap today:** the direct/non-bwrap path does
  `env: { ...process.env }` (`eval.ts`), inheriting real HOME + git/ssh/aws creds.
- **external via network** (`git push`, paid API, exfil) → deny-all / allowlist
  net (the confinement backends).
- **irreversible/specific** (push to prod, charge a card) → `interceptTools` /
  `notTool` — you can discard a temp dir, but you can't un-push.

**Why this matters for the Mac decision:** an ephemeral run environment (temp CWD +
temp HOME + scrubbed env, only the harness's own auth re-injected) needs **no
kernel features**, so it works on macOS **today**, before the Seatbelt backend
ships. It's the cheapest, most cross-platform protection and covers the
side-effect threat that the per-host `nft` wall (Linux-only) does not. Net: ship
the ephemeral run environment first; it de-risks Mac more than the Seatbelt
backend does.

### Status + validation (2026-06-17)

**Foundation shipped, default OFF.** `ephemeralRunEnv(base, { home, allow })` (pure,
tested) + an opt-in `EvalSpec.ephemeralEnv` flag now build a throwaway HOME/TMPDIR +
an auth-allowlist env (`ANTHROPIC_*`/`CLAUDE_*`/`PATH`/`LC_*` + region/profile),
dropping `GIT_*`/`GH_TOKEN`/`SSH_*`/AWS secret keys. The default (flag-off) path is
byte-identical to before (asserted by a test), so it can't break the eval tier's
auth until we deliberately flip it.

**Auth-survival validated on the real sub** (haiku, 1 trial, `ephemeralEnv: true`):
the run authenticated through the scrubbed HOME — exit 0, **$0.003**, output `OK.`,
cache read ~21.7k tok (caching unaffected). So the **env-var auth path works**: this
environment's credential rides an allowlisted `ANTHROPIC_*` var, which survives the
scrub.

**The remaining gap before default-on:** that only covers **env-var** auth. A user
whose subscription credential lives **only in `~/.claude/.credentials.json`** (a
file under HOME, the common OAuth case) would **lose it** when HOME is scrubbed —
`ephemeralRunEnv` injects env vars, not the credential file. So the safe default-on
flip needs one more step: **inject the harness's own credential file into the
throwaway HOME** (symlink/copy just `~/.claude` auth, not `~/.gitconfig`/`~/.ssh`).
Until then the flag stays opt-in. Two smaller follow-ups noted in code: AWS
static-key auth (region/profile allowed, secret keys dropped) and the
cache-key↔random-HOME interaction (both moot while default-off).

## Why not the obvious shortcuts (findings)

### Does a drop-in cross-platform, no-VM, arbitrary-subprocess sandbox exist?

Yes — but each has a disqualifier for us:

- **Anthropic `sandbox-runtime` (`srt`)** — TypeScript, Apache-2.0, npm, Seatbelt +
  bwrap, deny-all **+ per-host allowlist via proxy**. Best general fit, but: "beta
  research preview"; Linux net is a **bypassable proxy** (our `nft` is stronger);
  adopting it would _downgrade_ our Linux egress; extra deps (`bwrap`/`socat`/
  `ripgrep`). → **fallback, not default.**
- **nono** (always-further) — Apache-2.0, Rust+SDKs, domain allowlist. Pre-1.0,
  company-backed (watch for open-core gating). → fallback.
- **Birdcage** (phylum-dev) — **GPL-3.0** (viral), network is binary on/off (no
  allowlist), Rust crate only (no CLI/npm). → reference only.
- **bwrap / sandbox-exec / Landlock / nsjail / extrasafe** — single-OS _building
  blocks_ a cross-platform tool composes. We compose two of them.

### Can't we just use the `claude` binary's own sandbox?

Claude Code 2.x **has** a real FS+network sandbox (`sandbox` key in
`settings.json`; macOS Seatbelt + Linux bwrap+socat; per-host _domain_ allowlist;
`/sandbox`). But it can't be our confinement layer, for three reasons:

1. **Bash-tool only — hooks run unconstrained.** Docs: _"MCP servers and hooks are
   separate processes that run unconstrained on the host."_ Confining untrusted
   **hooks** is exactly vigiles's job.
2. **No external API** — internal to interactive/agent Bash; no flag to run a
   one-off command sandboxed from our harness.
3. **Claude-Code-only** — Codex won't have it; depending on it breaks the
   harness-agnostic boundary.

(The whole-process wrapper `@anthropic-ai/sandbox-runtime` is the `srt` package
above — a separate tool, not the in-binary sandbox.)

## Parked idea — verify & test the harness's sandbox config (the pillar pivot)

The `claude` finding turns Anthropic shipping a sandbox from a threat into a
**feature surface**: `settings.json`'s `sandbox` block is a harness surface, and
vigiles's thesis is _verify + test harness surfaces_, not own them. Two future
capabilities (saved, not scheduled):

- **Verify (pillar 1):** `sandbox.network.allowedDomains` / `filesystem.allowWrite`
  entries are real and coherent — e.g. flag a SessionStart hook that phones a
  domain the sandbox would block, or a `denyRead` that misses a secret path.
  _"Valid is not true"_ applied to sandbox policy. **(this is the "validating
  network access" idea worth keeping.)**
- **Test (pillar 2):** does the configured sandbox actually block what it claims?
  We already have the machinery (`recordEgress` / `egress:{allow}`) to prove it.

Harness-aware (Codex has its own sandbox config to verify too), and on-brand — it
rides on the harness's sandbox the way `enforce()` rides on ESLint.

## Implementation sketch (when scheduled)

1. Extract the `vigiles/os-isolation` port: `isolate(cmd, { fs, net }) → result`,
   the only surface `decideSandbox` / `run-hook` / `eval` import. Backends behind
   it: `bwrap` (move current `sandbox.ts`/`egress.ts` glue), `seatbelt`
   (`sandbox-exec` + static SBPL), `refuse`.
2. Per-backend capability probe (`sandbox-exec` present on macOS; `bwrap`+userns on
   Linux) — same honest "probe the real capability, not the binary" rule.
3. Enforce the boundary with `eslint-plugin-boundaries` (nothing outside
   `os-isolation` names a raw primitive), dogfooded via `enforce()` — same pattern
   as `core ⊄ adapter`.
4. Capabilities degrade through the port: `net.allow` (per-host) → Linux only; Mac
   surfaces deny-all-net + a clear "per-host unavailable on this backend".

## Sources

- Survey + `claude`-binary findings: this session's research agents.
- Anthropic `sandbox-runtime`: https://github.com/anthropic-experimental/sandbox-runtime
- Claude Code sandboxing docs: https://code.claude.com/docs/en/sandboxing.md ·
  https://code.claude.com/docs/en/sandbox-environments.md
- Birdcage: https://github.com/phylum-dev/birdcage · nono: https://github.com/always-further/nono
- Related: [`sandboxing.md`](../docs/sandboxing.md) · [`safety.md`](../docs/safety.md) ·
  [`egress-sandbox-tooling.md`](egress-sandbox-tooling.md) · [`sandbox-network.md`](sandbox-network.md)
