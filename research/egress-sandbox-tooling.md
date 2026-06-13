# Egress-sandbox tooling: build vs adopt, and why CI breaks

Companion to [`sandbox-network.md`](sandbox-network.md) (the resolver-pinned
allowlist design) and [`../docs/sandboxing.md`](../docs/sandboxing.md) (the
graceful-degradation tier model). Those two cover _what we enforce_ and _why
nft+resolver_. This doc is narrower: the **tooling choice** for the rootless
connectivity layer, and **why the test fails on GitHub-hosted runners** — and
what to do about it.

## TL;DR — the verdict

**Swap `slirp4netns` for `pasta` (passt). It is a near-drop-in, and it is the
fix for the CI symptom.** Keep the rest of the stack unchanged — `bwrap` for the
namespace, `nft` for the allowlist + counters, the resolver layer for DNS. The
smallest first step is a ~10-line spike: replace `slirp4netns --configure <pid>
tap0` with `pasta --config-net --netns /proc/<pid>/ns/net` (or `pasta
--config-net <pid>`) and re-run the egress integration test on `ubuntu-24.04`.
Pasta is what Podman itself switched its rootless default to, it attaches to an
_existing_ netns the same way slirp4netns does, and crucially it
**does not depend on `/dev/net/tun`** — it bridges L2-in-namespace to L4 host
sockets without the kernel tun driver
([passt.top](https://passt.top/passt/about/),
[pasta(1) manpage](https://manpages.debian.org/testing/passt/pasta.1.en.html)).

Do **not** adopt a heavier tool (nsjail, firejail, gVisor, Podman-as-a-library,
microVM) — every one of them rides the same unprivileged-userns + tun/slirp
primitives we already drive, so they inherit the same CI failure without buying
us the read-back (nft counters) the assertion needs. Landlock network rules are
attractive (no netns, no slirp, no tun at all) but are **port-only, no per-host,
no packet accounting** — they can't satisfy "allow host X, count packets, drop
the rest" alone. Keep a **capability-probe-skip** as the belt-and-suspenders
fallback regardless of which connector wins.

## Why the test fails on GitHub-hosted runners

The symptom is precise: `/dev/net/tun` is present, userns is unlocked
(`apparmor_restrict_unprivileged_userns=0`, `unprivileged_userns_clone=1`), yet
`slirp4netns --configure <pid> tap0` never attaches `tap0` — the netns has only
`lo`. So this is **not** the common `slirp4netns failed: open("/dev/net/tun"):
No such device` CI failure (that one is the tun device being absent in
containers/VMs, fixed by `--device /dev/net/tun --cap-add NET_ADMIN`)
([podman#9543](https://github.com/containers/podman/issues/9543)). Our tun
device is there. What fails is slirp4netns's `setns` into the bwrap-created
network namespace and the tap-attach handshake — a class of
`setns(CLONE_NEWNET): Invalid argument`-shaped failures seen when slirp4netns is
pointed at a namespace it didn't create
([podman#17033](https://github.com/containers/podman/issues/17033)). slirp4netns
is increasingly the legacy path: it has been "largely superseded by pasta"
([oneuptime](https://oneuptime.com/blog/post/2026-03-17-use-slirp4netns-networking-podman/view)),
which is why the friction shows up here first.

## Tool comparison

Scored for _our_ job: confine an untrusted child, allow only listed hosts,
**read back reached-vs-dropped** for the assertion, rootless, on a stock
GitHub-hosted `ubuntu-24.04` runner.

| Tool                             | Rootless       | GH-hosted runner             | Allowlist granularity                 | Read-back reached/dropped | Weight                          |
| -------------------------------- | -------------- | ---------------------------- | ------------------------------------- | ------------------------- | ------------------------------- |
| **pasta / passt**                | Yes            | **Likely yes**               | none itself — pairs with our nft      | via our nft counters      | one static binary, no tun       |
| slirp4netns (current)            | Yes            | **No (the bug)**             | none itself — pairs with our nft      | via our nft counters      | one binary, needs tun handshake |
| bubblewrap (we keep it)          | Yes            | Yes (namespace ok)           | n/a (no networking of its own)        | n/a                       | already in stack                |
| nsjail (Google)                  | Yes\*          | Inherits userns/tun          | iptables in netns → needs root        | none built in             | heavier, C++ build              |
| firejail `--netfilter`           | partly         | Inherits                     | iptables file, **needs root** netns   | none built in             | SUID-root by default            |
| Landlock net (≥6.7)              | Yes            | **Yes**                      | **TCP port only, no host/IP**         | **none (no accounting)**  | tiny, kernel-native             |
| gVisor / runsc                   | Yes            | Inherits userns              | netstack policy, not a host allowlist | limited                   | heavy runtime                   |
| eBPF (Tetragon/harden-runner)    | no (CAP_BPF)   | job-level only               | by domain/IP                          | yes (insights/logs)       | agent/SaaS, not embeddable      |
| Podman as a lib/CLI              | Yes            | **Inherits the bug**         | via pasta/slirp under the hood        | not for our assertion     | huge dependency                 |
| microVM (Firecracker/crun --kvm) | needs /dev/kvm | **No /dev/kvm on GH-hosted** | full                                  | full                      | enormous                        |

\* nsjail is rootless for namespace setup but its network filtering wants
in-netns `iptables`, which needs `CAP_NET_ADMIN` — the same wall firejail hits
([firejail#1085](https://github.com/netblue30/firejail/issues/1085),
[firejail#403](https://github.com/netblue30/firejail/issues/403)). Neither gives
us packet **counters** for the assertion; we'd still hand-roll nft. So they add
weight without removing the thing we already own.

The pattern: everything except Landlock and eBPF rides the **same**
unprivileged-userns + user-mode-net-stack primitives our `bwrap+slirp/pasta`
stack already drives ([`../docs/sandboxing.md`](../docs/sandboxing.md) makes the
same point about Docker/podman-rootless). Adopting them is lateral, not up.

## pasta deep-dive

**Why Podman switched.** Pasta is the default rootless network in Podman 5.3+
(available since v4.1, RHEL 9.5 default) for performance and architecture
reasons: it **copies the host's network config into the namespace** and uses the
host gateway instead of slirp4netns's NAT'd `10.0.2.x/24`, so it avoids NAT
overhead, adds native IPv6, and preserves source IPs
([Oracle docs](https://docs.oracle.com/en/learn/ol-podman-pasta-networking/),
[sanj.dev](https://sanj.dev/post/podman-pasta-vs-slirp4netns-networking/),
[Red Hat ch.12](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/building_running_and_managing_containers/assembly_communicating-among-containers_building-running-and-managing-containers)).
(One caveat: a Podman discussion notes slirp4netns can overtake pasta on
throughput above ~8-way parallelism
([podman#22559](https://github.com/containers/podman/discussions/22559)) —
irrelevant for our single-hook test.)

**Does it attach to a bwrap netns?** Yes — this is the load-bearing fact. The
manpage gives two forms: `pasta [OPTION]... PID` and `pasta [OPTION]... --netns
[PATH|NAME]`, where a PID/path "associates to an existing user and network
namespace"
([pasta(1)](https://manpages.debian.org/testing/passt/pasta.1.en.html)). That is
the direct analogue of `slirp4netns --configure <pid>`. `--config-net` then
"set[s] up addresses and routes ... sourced from the host, and bring[s] up the
tap interface" — i.e. it does the netlink configuration slirp4netns's
`--configure` did, automatically (ibid.).

**Migration cost — near drop-in.**

```
# before
slirp4netns --configure --mtu=65520 --disable-host-loopback <pid> tap0
# after
pasta --config-net --netns /proc/<pid>/ns/net     # or: pasta --config-net <pid>
```

The interface name changes (pasta uses a host-derived name, not `tap0`), so our
nft rules must bind to the actual interface or be interface-agnostic (`oif` by
name → match on address/verdict instead). Pasta backgrounds itself once
configured and exits when the namespace is torn down
([passt.top](https://passt.top/passt/about/)) — same lifecycle as slirp4netns,
so `egress-entry.ts`'s spawn/wait/teardown shape barely changes.

**Why it should fix the runner.** passt/pasta is explicitly "without requiring
any capabilities or privileges" and is built precisely so unprivileged users
**don't** need direct `/dev/net/tun`/`CAP_NET_ADMIN` — it maps the in-namespace
tap to native L4 host sockets
([passt.top](https://passt.top/passt/about/),
[pasta(1)](https://manpages.debian.org/testing/passt/pasta.1.en.html)). Since
our failure is the tap-attach handshake (not a missing device), moving to the
connector that doesn't lean on that handshake is the targeted fix.

**Honest caveat:** the sources prove pasta avoids the tun-device _dependency_
and attaches to an existing netns; they do **not** contain a direct report of
"slirp4netns fails to attach on `ubuntu-24.04` GH-hosted, pasta succeeds." That
last mile is plausible-but-unproven, which is exactly why the recommendation is
a 10-line spike before a full migration, not a blind swap.

## Landlock assessment

Tempting because it needs **no netns, no slirp/pasta, no tun** — it's a kernel
LSM you apply after `fork()` before `exec()`, fully unprivileged, and it works
on GH-hosted runners. But the network ABI is thin:
`LANDLOCK_ACCESS_NET_BIND_TCP` / `LANDLOCK_ACCESS_NET_CONNECT_TCP` restrict
`bind()`/`connect()` **by TCP port only** — ABI v3 (kernel 6.7) added bind, ABI
v4 added connect, and it's **TCP-only** (UDP still unsupported)
([Phoronix](https://www.phoronix.com/news/Landlock-Networking-Linux-6.7),
[landlock kernel doc](https://docs.kernel.org/userspace-api/landlock.html)).
`landrun` exposes this but needs kernel 6.8 / ABI v5
([landrun](https://github.com/Zouuup/landrun)).

Two limits kill it as a _standalone_ for our test: (1) **no per-host/IP** — you
can say "TCP 443" but not "only `registry.npmjs.org`"; (2) **no packet
accounting** — there's nothing to count, so the "allowed host got packets" half
of the assertion has no signal.

The viable hybrid is exactly what the **Sandlock** paper ("Confining AI Agent
Code with Unprivileged Linux Primitives") does: Landlock + seccomp with **no
namespaces or root**, where port-only policy is kernel-enforced directly, but
**host-specific rules are mediated by a supervisor / local HTTP proxy** plus
**hostname-resolution pinning at startup**
([Sandlock, arXiv 2605.26298](https://arxiv.org/html/2605.26298v1)). That is the
same shape as our resolver-pinned-allowlist plan in
[`sandbox-network.md`](sandbox-network.md) — Landlock could become a
**second, namespace-free enforcement tier** (a future "Tier C") for hosts where
userns is hard-disabled, with the proxy doing host filtering and the read-back.
It does not replace the nft path for the counting test.

## How others pass egress tests in CI

The prevailing answers, by project:

- **Podman / crun / containers CI** — the move _is_ pasta: it's the rootless
  default and the documented escape from slirp4netns's tun/handshake fragility
  ([oneuptime](https://oneuptime.com/blog/post/2026-03-17-use-slirp4netns-networking-podman/view),
  [podman#22543](https://github.com/containers/podman/issues/22543)). Where tun
  truly is missing they mount `--device /dev/net/tun --cap-add NET_ADMIN`
  ([podman#9543](https://github.com/containers/podman/issues/9543)) — i.e.
  privileged-device, the (b) answer, not available to us unprivileged.
- **StepSecurity harden-runner** — eBPF egress allowlist with **full block +
  audit on Linux GitHub-hosted runners** (Windows/macOS audit-only), read-back
  via the job-summary "security insights" view
  ([harden-runner](https://github.com/step-security/harden-runner)). Proof eBPF
  egress control _does_ run on stock GH-hosted Linux — but it's a **job-level
  GHA action / agent**, not a library you embed to confine one child process and
  assert on it. Answer (e): different layer.
- **gVisor** — its own netstack; CI runs are heavyweight and often
  KVM/self-hosted. Not a rootless host-allowlist for a child.
- **firejail / nsjail** — in-netns `iptables` filtering needs root, so their CI
  for the network-filter path runs privileged
  ([firejail#1085](https://github.com/netblue30/firejail/issues/1085)).
- **Sandbox-as-a-service (e2b / microsandbox / Daytona) and microVMs** — push
  egress control into a VM/firecracker boundary, i.e. dedicated VM CI (answer
  d). Off the table on GH-hosted (no `/dev/kvm`).
- **Deno `--allow-net=host`** — host/port allowlist enforced **in the runtime**,
  no netns at all; but it only governs Deno's own fetch/connect, not an
  arbitrary untrusted child — the same scoping limit as Landlock.

Net: the prevailing rootless-without-VM answer in the container world is
**pasta**, and the prevailing CI-egress-enforcement answer (StepSecurity) is
**eBPF at the job level** — which validates eBPF works on GH-hosted but isn't
embeddable for our per-child assertion.

## Recommendation

1. **Smallest first step (do this first):** spike `pasta --config-net --netns
/proc/<pid>/ns/net` in `egress-entry.ts` behind a connector switch, run the
   egress integration test on `ubuntu-24.04`. If counters go non-zero and
   off-list still drops, pasta is the fix — keep the switch, default to pasta,
   keep slirp4netns as fallback.
2. **Keep nft + resolver unchanged** — they're the part that gives the
   assertion its read-back; no tool above replaces them.
3. **Keep / add capability-probe-skip** — already the house pattern
   (`sandboxAvailable()` in [`../docs/sandboxing.md`](../docs/sandboxing.md));
   extend it to probe pasta-attach so a runner that still can't attach skips the
   _assertion_ rather than failing red.
4. **Park Landlock as a future namespace-free tier** for userns-disabled hosts,
   using the Sandlock proxy shape for host filtering — track, don't build yet.

## Honest case against each

- **Against pasta:** the GH-hosted-runner success is inferred, not directly
  cited; interface-name change touches nft rules; one more vendored binary to
  pin/version. Mitigated by the spike-first plan.
- **Against staying on slirp4netns + probe-skip only:** the test silently stops
  exercising the boundary on the most common CI, which is where regressions
  would land — you'd ship an untested egress rail.
- **Against Landlock:** can't count packets or filter by host alone; needs a
  proxy/supervisor to be useful, i.e. it's a new subsystem, not a swap.
- **Against nsjail/firejail:** root for the netfilter path defeats the rootless
  premise; no counters anyway.
- **Against gVisor/microVM/Podman-lib:** weight and KVM/privilege requirements
  GH-hosted can't meet; all still ride pasta/slirp underneath for the rootless
  case.
- **Against eBPF/harden-runner:** not embeddable as a per-child assertion;
  job-level SaaS agent, different problem.

## Sources

- pasta/passt — [passt.top/passt/about](https://passt.top/passt/about/),
  [pasta(1) manpage](https://manpages.debian.org/testing/passt/pasta.1.en.html)
- Podman switch to pasta —
  [Oracle](https://docs.oracle.com/en/learn/ol-podman-pasta-networking/),
  [sanj.dev](https://sanj.dev/post/podman-pasta-vs-slirp4netns-networking/),
  [Red Hat ch.12](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/building_running_and_managing_containers/assembly_communicating-among-containers_building-running-and-managing-containers),
  [oneuptime](https://oneuptime.com/blog/post/2026-03-17-use-slirp4netns-networking-podman/view),
  [podman#22543](https://github.com/containers/podman/issues/22543),
  [podman#22559](https://github.com/containers/podman/discussions/22559)
- slirp4netns CI failures —
  [podman#9543](https://github.com/containers/podman/issues/9543),
  [podman#17033](https://github.com/containers/podman/issues/17033)
- Landlock network —
  [Phoronix 6.7](https://www.phoronix.com/news/Landlock-Networking-Linux-6.7),
  [kernel doc](https://docs.kernel.org/userspace-api/landlock.html),
  [landrun](https://github.com/Zouuup/landrun)
- Sandlock (Landlock+seccomp AI-agent sandbox) —
  [arXiv 2605.26298](https://arxiv.org/html/2605.26298v1)
- StepSecurity harden-runner —
  [github.com/step-security/harden-runner](https://github.com/step-security/harden-runner)
- firejail/nsjail network filtering root requirement —
  [firejail#1085](https://github.com/netblue30/firejail/issues/1085),
  [firejail#403](https://github.com/netblue30/firejail/issues/403)

## Field findings (2026-06-13) — privilege, not connector, is the wall

Tried to "just swap to pasta." Captured the real errors instead, and they
reframe the problem:

- **As root** (our dev container is uid 0): pasta refuses — `Don't run as root.
Changing to nobody...` then `Couldn't open user namespace .../ns/user:
Permission denied`. It self-drops to `nobody`, which can't enter the bwrap
  child's user namespace.
- **As non-root** (a created `tester` user, mirroring a CI runner): the
  privilege-drop is gone, but pasta's _attach-to-existing-netns_ path is flaky —
  intermittent `Couldn't switch to pasta namespaces: No child processes` (ECHILD,
  likely PID-namespace reaping in the nested container), and in native create
  mode: **`Failed to open() /dev/net/tun: Permission denied` → Failed to set up
  tap device**.

The last one is the key: **both slirp4netns and pasta need `/dev/net/tun` +
privilege** to bring up the tap and configure the netns. Our **local e2e passes
only because the dev box is root**; GitHub's hosted `test` job runs **non-root**,
so the connector can't open tun there — _that_ is why slirp4netns "fails" on the
runner (the netns ends up with only `lo`), not a slirp-vs-pasta difference.

**Conclusion:** the connector choice is a red herring for CI. The fix for "e2e
runs in CI" is to give the connector the privilege it needs — run the e2e job as
**root in a privileged container** (`container: { image: node:20-bookworm,
options: --privileged --device /dev/net/tun }`), where the already-working
slirp4netns path attaches exactly as it does on a root dev box. That's what
`.github/workflows/ci.yml`'s `e2e` job now does. pasta stays as an experimental,
opt-in connector (`VIGILES_EGRESS_CONNECTOR=pasta`) for rootless environments
that don't restrict tun; its attach-path needs more work (likely an inverted
topology where pasta creates the namespace and runs bwrap _inside_ it, rather
than attaching to a bwrap-created netns) before it's the rootless default.
