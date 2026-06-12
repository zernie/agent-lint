# Sandbox network: from deny-all to allowlisted, recorded egress

## Where we are

Two egress modes ship today (`src/run-hook.ts`, `src/sandbox.ts`):

- **deny-all** (default under bwrap): the net namespace has loopback only and no
  external route. A real wall — nothing leaves. Tested in `src/sandbox.test.ts`.
- **`recordEgress`**: a recording proxy on the sandbox loopback captures every
  `host:port` a proxy-honoring tool tries to reach (`trace`/`r.egress`) **and
  blocks it**. Records intent over the wall; the wall still holds. Tested
  end-to-end in `src/run-hook.test.ts` (incl. the dogfood against a real
  oh-my-claudecode hook).

Both **block**. Neither lets a real `npm install` / `pip install` succeed — which
is exactly the case a user wants to test ("does this skill install cleanly, and
only from the registries I expect?"). That's the gap this doc designs.

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

- `pasta --config-net -- <cmd>` did **not** trivially give a child net access +
  a parseable connection log in a first pass — it needs more careful netns
  handoff (pasta managing the netns vs. bwrap creating it). Needs a focused spike.
- The deny-all wall and the `recordEgress` proxy both work and are tested; they
  were the right first increment (real value, fully verifiable) before the
  gateway plumbing.

## Plan

1. Spike the bwrap-netns ↔ pasta/slirp4netns handoff in isolation (shell), prove
   a child can reach an allowlisted host and be logged.
2. Wrap it behind `egress: { allow }`, parse the log into `r.egress`
   (`allowed` flag), reuse `assertEgressOnly`.
3. Gate the integration test on tool availability (like the bwrap tests).
4. A separate `strictFs` (minimal-rootfs bind) closes the read-exposure gap noted
   in [`docs/sandboxing.md`](../docs/sandboxing.md).
