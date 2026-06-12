/**
 * vigiles — allowlisted, recorded egress for a confined hook (`egress: { allow }`).
 *
 * The deny-all wall (`--unshare-all`) and the `recordEgress` proxy both BLOCK; a
 * hook whose setup needs a real `npm install` can't be tested under either. This
 * is the in-between: let traffic actually reach the network, but **only to an
 * allowlist**, and **record** it — with the boundary at the packet layer so it
 * can't be bypassed by a raw socket (an `HTTP_PROXY` allowlist can).
 *
 * How it works (proven in `research/spikes/sandbox-network-allowlist.sh`):
 * `slirp4netns --configure` attaches a `tap` to the bwrap netns (rootless egress
 * via a userspace TCP/IP stack), then an `nft` ruleset INSIDE the netns — a
 * `policy drop` output chain that `accept`s only the resolved allowlist IPs (plus
 * loopback + the DNS resolver) and `log`+`drop`s the rest — is the hard wall. The
 * per-rule `counter`s read back which allowlisted hosts were actually reached and
 * how much was dropped.
 *
 * This module holds the PURE seams — resolution parsing, ruleset generation,
 * counter parsing, result mapping — so the enforcement logic is unit-tested
 * without a sandbox. The orchestration (`src/egress-entry.ts`) needs real bwrap +
 * slirp4netns + nft and is covered by the gated integration test.
 *
 * Honest limits (see `docs/sandboxing.md`): the allowlist is resolved to IPs at
 * launch (a host whose DNS rotates outside the run's window could miss an IP —
 * the dynamic resolver-pinned set is the documented next layer). The record names
 * the allowlisted hosts that were reached and counts what was dropped, but does
 * not yet name the DROPPED hosts (that needs the in-netns DNS-query log).
 */
import { spawnSync } from "node:child_process";

import { type EgressAttempt } from "./sandbox.js";

/** A host plus the IPs it resolved to, split by family (nft needs them apart). */
export interface ResolvedHost {
  readonly host: string;
  readonly v4: readonly string[];
  readonly v6: readonly string[];
}

/** Per-host and aggregate nftables counters read back after a confined run. */
export interface EgressCounters {
  /** Allowlisted hosts that saw traffic, with the nft counter for each. */
  readonly allowed: readonly {
    readonly host: string;
    readonly packets: number;
    readonly bytes: number;
  }[];
  /** The catch-all drop rule: traffic to anything OFF the allowlist. */
  readonly dropped: { readonly packets: number; readonly bytes: number };
}

let cachedEgressAvailable: boolean | undefined;

/** Does a binary resolve on PATH? (probe via `command -v`, no output kept.) */
function hasBinary(name: string): boolean {
  try {
    return (
      spawnSync("sh", ["-c", `command -v ${name}`], {
        stdio: "ignore",
        timeout: 5_000,
      }).status === 0
    );
  } catch {
    /* v8 ignore next -- spawnSync only throws on a fork failure */
    return false;
  }
}

/**
 * Whether this host can run the allowlisted-egress sandbox: it needs the same
 * bubblewrap confinement the other tiers use PLUS `slirp4netns` (the rootless
 * gateway) and `nft` (the packet-layer allowlist). Cached — the answer can't
 * change within a run. `available` is injected so the bwrap probe isn't repeated.
 */
export function probeEgressAvailable(available: boolean): boolean {
  /* v8 ignore next -- non-Linux has no bwrap/slirp; CI/coverage runs on Linux */
  if (process.platform !== "linux") return false;
  return available && hasBinary("slirp4netns") && hasBinary("nft");
}

/** Cached {@link probeEgressAvailable}. `available` = the bwrap-sandbox probe. */
export function egressAvailable(available: boolean): boolean {
  if (cachedEgressAvailable === undefined) {
    cachedEgressAvailable = probeEgressAvailable(available);
  }
  return cachedEgressAvailable;
}

/**
 * Parse `getent ahosts <host>` output into the unique IPs, split by family. The
 * first whitespace token of each line is an address; `:` marks IPv6. Pure, so the
 * resolution-parsing is unit-tested without touching DNS.
 */
export function parseGetent(stdout: string): { v4: string[]; v6: string[] } {
  const v4 = new Set<string>();
  const v6 = new Set<string>();
  for (const line of stdout.split("\n")) {
    const ip = line.trim().split(/\s+/)[0];
    if (!ip) continue;
    if (ip.includes(":")) v6.add(ip);
    else if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) v4.add(ip);
  }
  return { v4: [...v4], v6: [...v6] };
}

/** Resolve a host to IPs via the system resolver (`getent`, synchronous). */
function getentLookup(host: string): { v4: string[]; v6: string[] } {
  /* v8 ignore start -- shells out to the real resolver; the parse is parseGetent */
  const res = spawnSync("getent", ["ahosts", host], {
    encoding: "utf-8",
    timeout: 10_000,
  });
  return parseGetent(res.stdout ?? "");
  /* v8 ignore stop */
}

/**
 * Resolve every allowlisted host to IPs. The lookup is injectable so the
 * empty-result / family-split behaviour is unit-tested with a fake resolver.
 */
export function resolveAllow(
  hosts: readonly string[],
  lookup: (host: string) => { v4: string[]; v6: string[] } = getentLookup,
): ResolvedHost[] {
  return hosts.map((host) => {
    const { v4, v6 } = lookup(host);
    return { host, v4, v6 };
  });
}

/** First nameserver in a resolv.conf body, or 8.8.8.8 if none is declared. */
export function parseResolvers(resolvConf: string): string[] {
  const out: string[] = [];
  for (const line of resolvConf.split("\n")) {
    const m = /^\s*nameserver\s+(\S+)/.exec(line);
    if (m) out.push(m[1]);
  }
  return out.length > 0 ? out : ["8.8.8.8"];
}

/** Escape an nft set comment label so a hostname can't break the ruleset. */
function nftLabel(host: string): string {
  return host.replace(/[^A-Za-z0-9._:-]/g, "_");
}

/**
 * Build the nftables ruleset that enforces the allowlist INSIDE the netns: a
 * `policy drop` output chain that accepts loopback, established replies, DNS to
 * the resolvers, and each allowlisted host's resolved IPs (a per-host `counter` +
 * `comment "allow:<host>"` so the read-back maps traffic to a name), then a
 * catch-all `log`+`counter`+`drop`. v4 and v6 are separate rules (an `inet` set
 * can't mix families) sharing the host's comment. Pure → the ruleset is asserted
 * in a unit test.
 */
export function buildEgressNft(opts: {
  allow: readonly ResolvedHost[];
  resolvers: readonly string[];
}): string {
  const lines: string[] = [
    "table inet vig {",
    "  chain output {",
    "    type filter hook output priority 0; policy drop;",
    '    oifname "lo" accept',
    "    ct state established,related accept",
  ];
  for (const r of opts.resolvers) {
    const fam = r.includes(":") ? "ip6" : "ip";
    lines.push(
      `    ${fam} daddr ${r} udp dport 53 counter accept comment "dns"`,
    );
    lines.push(
      `    ${fam} daddr ${r} tcp dport 53 counter accept comment "dns"`,
    );
  }
  for (const h of opts.allow) {
    const label = nftLabel(h.host);
    if (h.v4.length > 0) {
      lines.push(
        `    ip daddr { ${h.v4.join(", ")} } counter accept comment "allow:${label}"`,
      );
    }
    if (h.v6.length > 0) {
      lines.push(
        `    ip6 daddr { ${h.v6.join(", ")} } counter accept comment "allow:${label}"`,
      );
    }
  }
  lines.push('    log prefix "vig-drop " counter drop');
  lines.push("  }", "}");
  return lines.join("\n") + "\n";
}

/** The bound paths the in-netns wrapper and the orchestrator hand back through. */
export interface EgressFiles {
  readonly ioDir: string;
  readonly netready: string;
  readonly nft: string;
  readonly event: string;
  readonly counters: string;
}

/**
 * Assemble the full bwrap argv for an allowlisted-egress run: the shared
 * confinement args, the hook's added-back env, `CAP_NET_ADMIN` (so the in-netns
 * wrapper can load nft), `--info-fd 3` (so the orchestrator learns the child PID
 * to hand slirp4netns), the `VIG_*` paths the wrapper reads, and the trailing
 * `sh -c <wrapper>`. Pure (the bwrap/setenv args are computed by the caller), so
 * the assembled shape — caps, info-fd, the VIG_* env, the wrapper payload — is
 * asserted in a unit test.
 */
export function buildEgressBwrapArgv(opts: {
  base: readonly string[];
  setenv: readonly string[];
  files: EgressFiles;
  command: string;
  wrapper: string;
}): string[] {
  return [
    ...opts.base,
    "--cap-add",
    "CAP_NET_ADMIN",
    ...opts.setenv,
    "--setenv",
    "VIG_NETREADY",
    opts.files.netready,
    "--setenv",
    "VIG_NFT",
    opts.files.nft,
    "--setenv",
    "VIG_EVENT",
    opts.files.event,
    "--setenv",
    "VIG_COUNTERS",
    opts.files.counters,
    "--setenv",
    "VIG_IODIR",
    opts.files.ioDir,
    "--setenv",
    "VIG_HOOK",
    opts.command,
    "--info-fd",
    "3",
    "sh",
    "-c",
    opts.wrapper,
  ];
}

const COUNTER = /counter packets (\d+) bytes (\d+)/;
const ALLOW_COMMENT = /comment "allow:([^"]+)"/;

/**
 * Parse `nft list chain inet vig output` back into per-host allowed counters and
 * the aggregate drop counter. Sums multiple rules that share a host comment (the
 * v4 + v6 split). Pure, so the read-back is unit-tested without a sandbox.
 */
export function parseNftCounters(nftText: string): EgressCounters {
  const allowed = new Map<string, { packets: number; bytes: number }>();
  let dropped = { packets: 0, bytes: 0 };
  for (const line of nftText.split("\n")) {
    const c = COUNTER.exec(line);
    if (!c) continue;
    const packets = Number(c[1]);
    const bytes = Number(c[2]);
    const a = ALLOW_COMMENT.exec(line);
    if (a) {
      const prev = allowed.get(a[1]) ?? { packets: 0, bytes: 0 };
      allowed.set(a[1], {
        packets: prev.packets + packets,
        bytes: prev.bytes + bytes,
      });
    } else if (line.includes("vig-drop") || /\bdrop\b/.test(line)) {
      dropped = {
        packets: dropped.packets + packets,
        bytes: dropped.bytes + bytes,
      };
    }
  }
  return {
    allowed: [...allowed.entries()].map(([host, v]) => ({ host, ...v })),
    dropped,
  };
}

/**
 * Map parsed counters to the run result: one {@link EgressAttempt} per
 * allowlisted host that saw traffic (`allowed: true`, with its packet/byte
 * counts), plus the aggregate dropped counter. `ts` is stamped once per run (the
 * counters are end-of-run totals, not per-connection events). Pure.
 */
export function countersToResult(
  counters: EgressCounters,
  now: number,
): {
  egress: EgressAttempt[];
  egressDropped: { packets: number; bytes: number };
} {
  const egress = counters.allowed
    .filter((a) => a.packets > 0)
    .map((a) => ({
      host: a.host,
      port: 0,
      ts: now,
      allowed: true,
      packets: a.packets,
      bytes: a.bytes,
    }));
  return { egress, egressDropped: counters.dropped };
}
