---
status: idea
topic: sandbox
---

# `vigiles/os-isolation` port — implementation design

> Status: **design of record (2026-06-17), not yet implemented.** The decision
> (port + native backend per OS) lives in
> [`cross-platform-sandboxing.md`](cross-platform-sandboxing.md); this doc is the
> grounded, phased build plan over the existing (997-test) sandbox core. Companion
> to that decision doc and [`docs/sandboxing.md`](../docs/sandboxing.md).

Goal: extract a narrow **`os-isolation` port** so confinement is selected by OS
capability probe, `bwrap`(+`nft`) / `sandbox-exec`(Seatbelt) / `refuse` live behind
it, and **nothing outside the backends names a raw primitive**. Confinement is
**harness-agnostic** (keyed by code provenance + OS, not by which harness runs), so
it is a separate cross-cutting port — **not** part of `HarnessAdapter`.

## What names the primitives today (the surface to absorb)

- `src/sandbox.ts` — `sandboxAvailable()`/`probeSandbox()` (the real `bwrap --unshare-all`
  probe), `bwrapArgs()`, `setenvArgs()`, `runSandboxed()` (the mock co-launch under
  one netns), plus the pure policy `decideSandbox()`/`specTrusted()`/`SandboxMode`.
- `src/run-hook.ts` — `directSpawn`/`sandboxedSpawn`/`egressSpawn`, `runConfinedOrDirect`,
  `RunHookDeps`/`REAL_DEPS`.
- `src/egress.ts` + `src/egress-entry.ts` — the `nft` per-host allowlist (Linux only).

Consumers: `harness-test.ts` (`decideSandbox` + `runSandboxed`, CC-only guard) and
`eval.ts` (`ephemeralRunEnv`/`seedEphemeralHome` — the **separate** state-protection
axis, not a confinement backend).

Pattern to mirror: interface in `src/core/` (like `core/dialect.ts`), concrete impl
in an adapter dir, an `AdapterCapabilities`-style descriptor, a conformance kit, and
`eslint-plugin-boundaries` for the boundary (dogfooded via `enforce("boundaries/dependencies")`).

## The port interface (`src/core/os-isolation.ts` — interface only)

```ts
// Network policy as a tagged union — an unsupported combination is a compile-time
// shape, not a runtime flag check (make invalid states irrepresentable).
export type NetPolicy =
  | { readonly kind: "deny" } // --unshare-all / (deny network*)
  | { readonly kind: "loopback" } // egress denied, loopback up (co-launched mock)
  | { readonly kind: "allow"; readonly hosts: readonly string[] } // Linux/bwrap+nft ONLY
  | { readonly kind: "record" }; // record + block (Linux proxy)

export interface FsPolicy {
  readonly workdir: string; // the writable work dir (run cwd)
  readonly readPaths?: readonly string[]; // extra absolute READ allows (backend add-back)
  readonly writePaths?: readonly string[]; // extra absolute WRITE allows (IO/handoff dir)
  readonly home: string; // a fresh empty HOME (no host creds leak)
}

// What a backend can actually deliver — so callers/conformance branch honestly.
export interface IsolationCapabilities {
  readonly denyAllNet: boolean; // every backend that exists offers this
  readonly loopbackNet: boolean; // loopback up, egress blocked (mock reachable). bwrap only
  readonly perHostAllow: boolean; // per-host egress allowlist (packet layer). bwrap+nft ONLY
  readonly recordEgress: boolean; // record-and-block (proxy). Linux only
  readonly fsReadIsolation: boolean; // read-isolation of the host FS
}

export interface IsolationSpec {
  readonly argv: readonly string[];
  readonly fs: FsPolicy;
  readonly net: NetPolicy;
  readonly env?: Readonly<Record<string, string>>; // set INSIDE confinement, host env cleared
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly input?: string; // stdin (e.g. the hook event JSON)
}

export interface IsolationResult {
  readonly status: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly egress?: readonly EgressAttempt[]; // allow/record
  readonly egressDropped?: { readonly packets: number; readonly bytes: number };
  readonly filesWritten?: readonly string[]; // rel paths under workdir
}

export interface OsIsolationBackend {
  readonly name: string; // "bwrap" | "seatbelt" | "refuse"
  readonly capabilities: IsolationCapabilities;
  available(net?: NetPolicy): boolean; // probes the REAL capability for the requested net
  run(spec: IsolationSpec): Promise<IsolationResult>;
  runSync(spec: IsolationSpec): IsolationResult; // run-hook is sync (spawnSync)
}
```

**Policy stays separate from mechanism.** `decideSandbox`/`specTrusted`/`SandboxMode`
move to `src/core/sandbox-policy.ts` (pure domain) unchanged in signature; the only
change is callers compute `available` from `selectBackend(net).available(net)` instead
of `sandboxAvailable()`. The mechanism moves behind the port. Selection lives in a
composition-root registry (mirrors `adapter-registry.ts`):

```ts
// src/os-isolation.ts (composition root)
const BACKENDS = [bwrapBackend, seatbeltBackend]; // platform-guarded internally
export function selectBackend(
  net: NetPolicy = { kind: "deny" },
): OsIsolationBackend {
  return BACKENDS.find((b) => b.available(net)) ?? refuseBackend;
}
```

## Layout

| Path                              | Role                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/os-isolation.ts`        | the interface + shared **pure** types/parsers (`NetPolicy`, `FsPolicy`, `IsolationSpec/Result`, `EgressAttempt`, log/tree parsers) |
| `src/core/sandbox-policy.ts`      | `decideSandbox`/`specTrusted`/`SandboxMode` (moved out of `sandbox.ts`)                                                            |
| `src/os-isolation/bwrap.ts`       | bwrap backend (absorbs `bwrapArgs`/`setenvArgs`/`runSandboxed` + the run-hook bwrap spawners + the `egress.ts` glue)               |
| `src/os-isolation/seatbelt.ts`    | Seatbelt backend (new)                                                                                                             |
| `src/os-isolation/refuse.ts`      | refuse backend (all caps false, `available()`→false, `run` throws clearly)                                                         |
| `src/os-isolation.ts`             | registry + `selectBackend`                                                                                                         |
| `src/os-isolation-conformance.ts` | conformance kit (mirrors `assertAdapterConformance`)                                                                               |

`src/sandbox.ts` + `src/egress.ts` become **thin re-export shims** so `examples/*.mjs`
and the public exports/tests don't break (keeps it a non-breaking `refactor`; removing
the shims later is the `!` change).

## Capability matrix

| Capability                       | bwrap (Linux+userns)               | seatbelt (macOS)                                     | refuse |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------- | ------ |
| `denyAllNet`                     | ✅                                 | ✅                                                   | ❌     |
| `loopbackNet` (co-launched mock) | ✅                                 | ❌ — Seatbelt `(deny network*)` blocks localhost too | ❌     |
| `perHostAllow` (nft)             | ✅ _(iff slirp4netns+nft, probed)_ | ❌                                                   | ❌     |
| `recordEgress` (proxy)           | ✅                                 | ❌                                                   | ❌     |
| `fsReadIsolation`                | ✅                                 | ✅                                                   | ❌     |

`available(net)` is honest about the **requested** policy, not just the platform:
`bwrap.available({allow})` returns today's `egressAvailable(sandboxAvailable())`;
`seatbelt.available({allow})` is false (no per-host); a Mac asking for `perHostAllow`
gets `refuseBackend`.

## The macOS Seatbelt backend

`sandbox-exec -p '<SBPL>' <argv>` (inline, parameterized profile; `-f` if it grows).
The minimal "confine a test subprocess" profile: `(version 1)` + `(deny default)` +
`(deny network*)` + `(allow process-fork/process-exec ...)` + `(allow file-read* ...)`
for a **parameterized read set** (system paths node needs + `spec.fs.readPaths`) +
`(allow file-write* (subpath (param "WORKDIR")))` for the workdir/home/writePaths +
the minimal `sysctl-read`/`mach-lookup` node needs. Parameterized: `WORKDIR`, write
paths, read add-backs, HOME (via `-D KEY=VALUE`); everything else static. The backend
builds the child env itself (`{PATH, HOME: spec.fs.home, TMPDIR}` + `spec.env`, **not**
inheriting `process.env`) — re-creating bwrap's `--clearenv`+add-back at the spawn
level (and dovetailing with `ephemeralRunEnv`, Phase 4). `available()` = darwin +
`sandbox-exec` on PATH, cached.

**The sharp limitation (surfaced honestly):** Seatbelt `(deny network*)` blocks
**localhost too**, so bwrap's "co-launched mock reachable over loopback while egress
is blocked" trick has **no Seatbelt equivalent** (`loopbackNet: false`). Consequence
for `runHarnessTest` on Mac: a trusted spec runs **direct** (unchanged); an untrusted
spec that needs the mock **refuses** (the honest floor — same as having no backend).
Seatbelt's win on Mac is the **deny-net + fs confinement of a trusted-but-side-effecting
run**, paired with the ephemeral run env (Phase 4) — not the mock-co-launch path.

## Boundary enforcement (`eslint.config.mjs`)

Add an `os-isolation` element type; extend the existing `verify-core ⊄ …` and
`agnostic-surface ⊄ …` disallow lists to include `"os-isolation"` (same shape as the
`core ⊄ adapter` rule). `eslint-plugin-boundaries` governs **imports**; the
"only backends name the literal" floor is a scoped `no-restricted-syntax` banning the
string literals `bwrap`/`sandbox-exec`/`nft`/`slirp4netns` outside `src/os-isolation/**`.
Dogfood via a new `CLAUDE.md` rule ("Isolation Backends Only") that rides the existing
`enforce("boundaries/dependencies")` — no new linter wiring — plus a `docs/rules/` doc.

## Phased migration (every phase keeps `npm test` green + is shippable)

1. **Extract the interface + move bwrap/egress behind it, ZERO behaviour change.**
   New `core/os-isolation.ts` + `core/sandbox-policy.ts` + `os-isolation/{bwrap,refuse}.ts`
   - `os-isolation.ts` registry; `sandbox.ts`/`egress.ts` become shims re-exporting the
     **same functions** tests already import, so `sandbox.test.ts`/`run-hook.test.ts` pass
     unchanged. `bwrapBackend.run` builds literally `bwrapArgs(...)+setenvArgs(...)` — assert
     equality in a new pure test. The hard, valuable, test-preserving refactor.
2. **Add the Seatbelt backend + probe** (no wiring yet — Linux still picks bwrap). Pure
   tests for the SBPL profile builder (the string is the product, like `buildEgressNft`)
   - a **gated** real-`sandbox-exec` e2e that runs only on macOS, skips loudly on Linux CI.
3. **Wire selection by probe into the runners + the boundary lint rule.** `harness-test.ts`
   branches on `capabilities.loopbackNet` (bwrap co-launch vs Mac direct/refuse);
   `run-hook` `REAL_DEPS` sources from `selectBackend`; add the eslint element + literal
   ban + the `CLAUDE.md` rule (recompile). The lint rule passing with zero violations is
   the proof the extraction was complete (any stray `"bwrap"` outside the backends fails
   the build).
4. **(Optional) Fold the ephemeral run env through the surface** so Mac gets state
   protection too: the Seatbelt backend builds its child env via `ephemeralRunEnv` (moved
   to `core/`, pure) — host-protection (Seatbelt) + state-protection (throwaway HOME) in
   one coherent surface. Eval's `ephemeralEnv` stays default-off.

**Conformance kit** (`os-isolation-conformance.ts`, mirrors `assertAdapterConformance`):
caps are booleans; cross-cap invariants (`perHostAllow ⇒ recordEgress ⇒ denyAllNet`,
`loopbackNet ⇒ denyAllNet`); **descriptor⇄probe agreement** (`available({allow})` false
whenever `perHostAllow` false); a gated behavioural `assertBackendDeniesNet`. Run it over
every backend.

## Risks & non-goals

- **Gated-test reality (central constraint):** the Seatbelt real path runs ONLY on
  macOS, bwrap's only where userns works. CI is Linux → the Seatbelt e2e can't run there;
  a Mac dev can't run the bwrap path. Every real-spawn test is `skipIf(!backend.available())`
  and reports `⊘ SKIPPED` loudly (No Silent Skips). The **pure** logic (SBPL/argv builders,
  capability descriptors, conformance, policy) carries the testable weight and runs
  everywhere — the existing pure-vs-gated split.
- **Seatbelt blocks localhost** → no mock-co-launch on Mac (above). Real limitation,
  surfaced via `loopbackNet: false`, not a bug.
- **Per-host egress stays Linux-only** (`nft`+`slirp4netns`); Mac gets deny-all-net.
- **`srt` stays out** (would downgrade the Linux `nft` wall to a bypassable proxy + beta
  dep) — documented fallback, not built. **Claude Code's built-in sandbox stays out**
  (Bash-only, no external API, CC-only). The "verify the harness's _own_ sandbox config"
  idea is parked, not part of this.
- **Backward-compatible:** the `sandbox.ts`/`egress.ts` shims keep `examples/*.mjs` and
  public exports working → ships as `refactor` + a `feat` for the new Mac capability;
  removing the shims later is the `!` change.
- **`ephemeralRunEnv` is NOT a confinement backend** — orthogonal state-protection axis;
  Phase 4 only _reuses_ it inside the Seatbelt env construction.

## See also

- [`cross-platform-sandboxing.md`](cross-platform-sandboxing.md) — the decision this builds.
- [`docs/sandboxing.md`](../docs/sandboxing.md) · [`docs/safety.md`](../docs/safety.md) — the user-facing model.
- `src/sandbox.ts` · `src/run-hook.ts` · `src/egress.ts` · `src/harness-test.ts` · `eslint.config.mjs` — the code this refactors.
