/**
 * vigiles — **tool stubs on PATH** (rung R2 of the eval coverage model).
 *
 * A skill/hook/agent often calls a CLI tool (`psql`, `redis-cli`, `gh`, `git`,
 * `z3`, …) and then works with the RESULT. To test that downstream logic without
 * a live service, you SHADOW the real binary on PATH with a fake that emits a
 * **recorded / author-provided canned result** — a standard PATH-shim +
 * VCR-style record/replay technique, not a novel invention. See
 * `research/eval-coverage-and-isolation.md` (the three-rung model).
 *
 * This module is the REPLAY half: write a fake executable per tool that prints a
 * canned stdout/stderr and exits a canned code. A record-from-real-tool half (run
 * the real binary once at a known version, capture its output as the fixture) is
 * a documented follow-on — NOT implemented here.
 *
 * CRITICAL: the canned outputs are author/recorded fixtures, **never**
 * model-synthesized — a synthesized `gh`/`git` output looks plausible but
 * diverges from the real tool/version, producing false confidence (a green test
 * against a fiction).
 *
 * MVP scope: one canned result per binary; argv is IGNORED (every invocation of
 * the stub returns the same result). Argv-matching (different output per
 * sub-command / flags) is a follow-on.
 */
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

/**
 * A single fake binary: shadow the tool named `name` on PATH so that any
 * invocation prints `stdout` (default `""`), writes `stderr` (default none) to
 * fd 2, and exits with `exitCode` (default 0). Argv is ignored in the MVP.
 */
export interface ToolStub {
  /** The binary name to shadow on PATH (e.g. `"gh"`, `"psql"`). */
  readonly name: string;
  /** Canned stdout the fake prints. Default `""`. */
  readonly stdout?: string;
  /** Canned stderr the fake writes to fd 2. Default: none. */
  readonly stderr?: string;
  /** Exit code the fake returns. Default `0`. */
  readonly exitCode?: number;
}

/**
 * Encode a string as a single-line base64 literal safe to embed verbatim inside a
 * POSIX shell script.
 *
 * We base64-encode-and-decode the canned content (rather than interpolating it
 * raw, or `cat`ing a sibling data file) because base64's alphabet is a strict
 * subset of `[A-Za-z0-9+/=]` — it can never contain a quote, `$`, backtick,
 * newline, `;`, or any other shell metacharacter, so the embedded literal is
 * injection-proof regardless of the fixture's bytes. The script decodes it back
 * with `base64 -d` at run time, so the original bytes round-trip exactly. This is
 * simpler than a sibling data file (one self-contained script, nothing else to
 * write/clean up) and strictly safer than quoting.
 */
function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

/**
 * Render the POSIX shell script for one stub. `printf '%s'` (not `echo`) prints
 * the decoded bytes with no added trailing newline and no backslash/`-n`
 * surprises, so the fixture round-trips byte-for-byte.
 */
export function renderToolStub(stub: ToolStub): string {
  const lines = ["#!/bin/sh"];
  // stdout: decode the base64 literal straight to stdout. We pipe `base64 -d`'s
  // output directly (NOT through `printf '%s' "$(...)"`) because command
  // substitution strips trailing newlines — piping preserves the bytes exactly.
  if (stub.stdout !== undefined && stub.stdout !== "") {
    lines.push(`printf '%s' '${b64(stub.stdout)}' | base64 -d`);
  }
  // stderr: same, redirected to fd 2.
  if (stub.stderr !== undefined && stub.stderr !== "") {
    lines.push(`printf '%s' '${b64(stub.stderr)}' | base64 -d >&2`);
  }
  lines.push(`exit ${String(stub.exitCode ?? 0)}`);
  return lines.join("\n") + "\n";
}

/**
 * Write one executable POSIX shell stub per entry into `binDir` (which must
 * already exist). Each file is named exactly `stub.name` and `chmod 0o755` so it
 * is directly executable once `binDir` is on PATH. Pure-ish — fs only, no spawn.
 */
export function writeToolStubs(
  binDir: string,
  stubs: readonly ToolStub[],
): void {
  for (const stub of stubs) {
    const file = join(binDir, stub.name);
    writeFileSync(file, renderToolStub(stub), "utf-8");
    chmodSync(file, 0o755);
  }
}

/**
 * Convenience: mkdtemp a fresh bin dir under `parentDir`, write `stubs` into it,
 * and return its absolute path. Caller PREPENDS this dir to PATH so the fakes win
 * over the real binaries, and removes it when done (it lives under `parentDir`,
 * so a `parentDir` cleanup also clears it).
 */
export function stubBinDir(
  stubs: readonly ToolStub[],
  parentDir: string,
): string {
  mkdirSync(parentDir, { recursive: true });
  const binDir = mkdtempSync(join(parentDir, "vigiles-stub-bin-"));
  writeToolStubs(binDir, stubs);
  return binDir;
}
