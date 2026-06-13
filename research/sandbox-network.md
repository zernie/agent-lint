# Sandbox network: from deny-all to allowlisted, recorded egress

## Where we are

Three egress modes ship today (`src/run-hook.ts`, `src/sandbox.ts`,
`src/egress.ts`):

- **deny-all** (default under bwrap): the net namespace has loopback only and no
  external route. A real wall — nothing leaves. Tested in `src/sandbox.test.ts`.
- **`recordEgress`**: a recording proxy on the sandbox loopback captures every
  `host:port` a proxy-honoring tool tries to reach (`trace`/`r.egress`) **and
  blocks it**. Records intent over the wall; the wall still holds. Tested
  end-to-end in `src/run-hook.test.ts` (incl. the dogfood against a real
  oh-my-claudecode hook).
- **`egress: { allow }`** (NEW): allowlisted real egress — `slirp4netns
--configure` gives the netns a controlled route, an in-netns `nft` `policy drop`
  chain accepts only the allowlist's resolved IPs (per-host `counter`s) and
  `log`+`drop`s the rest. The install **succeeds** to the allowlist and a raw
  socket off it is **dropped** (the boundary is the packet layer, not a proxy).
  Pure seams in `src/egress.ts` (ruleset/counter/argv), orchestration in
  `src/egress-entry.ts`, tested end-to-end in `src/run-hook.test.ts` (incl. the
  OMC session-start dogfood: reaches `registry.npmjs.org`, drops nothing else).

The first two **block** — neither lets a real `npm install` / `pip install`
succeed. `egress: { allow }` closes that: install traffic reaches the allowlist
and only the allowlist. The remaining gap is naming the _dropped_ hosts and
pinning rotating DNS — the resolver layer below.

## The goal: allowlisted real egress + recording

Let install traffic actually reach the network, but:

- only to an **allowlist** (npm/pypi/crates/… by default), and
- **record** every connection (allowed and denied), unbypassably.

## Why it's non-trivial (and why not Docker)

The deny-all wall is `--unshare-net` (no route). To allow _controlled_ egress you
must give the namespace a route through a gateway you control — without root. The
unprivileged options are **`pasta`/`passt`** or **`slirp4netns`** (the rootless
user-mode network stacks podman uses). Docker/podman-rootless ride the same
unprivileged-userns primitive, so they're not a shortcut.

A proxy-with-`HTTP_PROXY` alone is **not** a boundary — raw-socket code ignores
the env. The boundary has to be at the routing/packet layer.

## Proposed architecture

```
bwrap netns ──(tap)── pasta/slirp4netns ──> host ──> internet
     │                                   nftables in the netns:
     │                                     allow → allowlisted IPs
     │                                     log+drop → everything else
     └── DNS resolver (logs queries; resolves allowlist, NXDOMAIN the rest)
```

1. **Connectivity:** `pasta`/`slirp4netns` attaches a `tap` to the bwrap netns
   (unprivileged), giving it a default route to the host's network.
2. **Allowlist + record (hard):** `nft` rules **inside the netns** — `accept` to
   resolved allowlist IPs, `log` + `drop` the rest. The `log` is the record;
   it can't be bypassed by raw sockets. (Reading nftables logs out of the netns
   is the fiddly part — likely an `nfqueue`/userspace logger or a parsed counter.)
3. **DNS record (cheap 80%):** a tiny resolver in the netns logs every query and
   answers only allowlisted names (NXDOMAIN otherwise). Catches the common case;
   direct-IP egress is the residual the nftables layer covers.

Surface: `runHook(cmd, ev, { egress: { allow: ["registry.npmjs.org", …] } })` →
`r.egress` with `allowed: boolean` per attempt; `assertEgressOnly` already exists.

## Experiment notes (2026-06-12)

On the dev box (userns works; `bwrap`, `slirp4netns`, `pasta` installed):

- **First pass (failed):** `pasta --config-net -- <cmd>` did **not** trivially
  give a child net access + a parseable connection log — it needs more careful
  netns handoff (pasta managing the netns vs. bwrap creating it).
- **Second pass (works) — `research/spikes/sandbox-network-allowlist.sh`.** The
  handoff that failed with `pasta --config-net` works with **`slirp4netns
--configure`**: create the netns with `unshare --user --map-root-user --net`,
  hand the child PID to `slirp4netns --configure --disable-host-loopback $PID
tap0`, and slirp sets up `tap0` (10.0.2.0/24, route, DNS) **inside** the netns
  itself — no manual `ip` needed. The spike proves all three doubted claims, end
  to end on a real network:
  1. **Real egress:** an allowlisted host returns a genuine `http_code=200`.
  2. **Unbypassable allowlist:** `nft` runs inside the mapped-root userns netns
     (it owns `CAP_NET_ADMIN` over its own netns); a `policy drop` output chain
     with per-IP `accept` rules blocks a non-allowlisted host (`curl rc=28`) **and
     a raw `bash /dev/tcp` socket** (`rc=124`) — the property an `HTTP_PROXY`
     allowlist cannot give, because the boundary is the packet layer, not env vars.
  3. **Readable record:** per-rule `counter`s read both allowed (`packets 1`) and
     denied (`vig-drop … packets 11`) traffic out of the netns.
- The deny-all wall and the `recordEgress` proxy both work and are tested; they
  were the right first increment (real value, fully verifiable) before the
  gateway plumbing.

## Plan

1. ~~Spike the bwrap-netns ↔ pasta/slirp4netns handoff in isolation (shell), prove
   a child can reach an allowlisted host and be logged.~~ **Done** via
   `slirp4netns --configure` — see `research/spikes/sandbox-network-allowlist.sh`.
   The **bwrap** handoff (the spike used `unshare`) is also solved: bwrap
   `--info-fd` reports the child PID, `slirp4netns --configure --ready-fd N`
   attaches, and the in-netns wrapper blocks on a netready file until the tap is
   up — `src/egress-entry.ts`. The in-netns `nft` needs `--cap-add CAP_NET_ADMIN`.
2. ~~Wrap it behind `egress: { allow }`, parse the `nft` counters into `r.egress`
   (`allowed` flag).~~ **Done** — `src/egress.ts` (`buildEgressNft`,
   `parseNftCounters`, `countersToResult`, `buildEgressBwrapArgv`), surfaced as
   `RunHookOptions.egress` → `r.egress` (allowed hosts) + `r.egressDropped`.
3. ~~Gate the integration test on tool availability (like the bwrap tests).~~
   **Done** — `egressAvailable(...)` gates the two `src/run-hook.test.ts` cases
   (the synthetic allow/drop/raw-socket proof + the OMC session-start dogfood).
4. **Next — resolver-pinned dynamic allowlist.** The shipped allowlist resolves to
   IPs at launch, so it can't follow DNS rotation or **name the dropped hosts**. A
   tiny DNS resolver in the netns (resolv.conf → `127.0.0.1`) that forwards
   queries, logs every name, and `nft add element`s an allowlisted answer's IPs
   just-in-time would do both: pin rotating hosts AND give `r.egress` a named,
   `allowed`-flagged entry per attempt (allowed _and_ dropped). The packet-layer
   `nft` wall stays the boundary; the resolver is the naming + pinning layer.
5. A separate `strictFs` (minimal-rootfs bind) closes the read-exposure gap noted
   in [`docs/sandboxing.md`](../docs/sandboxing.md).
