/**
 * `scripts/check.mjs` accounts for every job in ci.yml — covered, or declared
 * as NOT covered with the command that does run it.
 *
 * WHY THIS EXISTS. check.mjs was written so nobody would run a remembered
 * subset of CI (its own header: three PRs went red from a five-command list).
 * It then covered ONE of the workflow's jobs while reading, from its name and
 * its `18/18 passed`, like all of them — and on 2026-09-03 that cost a cycle:
 * a green `check` was taken for a green CI and the push broke the `test` job.
 *
 * A list of what-we-do-not-cover is the same hand-maintained list check.mjs
 * exists to abolish, one level up, so it is not trusted either: a NEW job in
 * ci.yml fails HERE until someone either covers it or names it, rather than
 * becoming a seventh thing that runs only in CI.
 *
 * Both files are read as TEXT. Importing check.mjs would RUN it — the module
 * body is the check run — which is the same "an import is a run" trap the KB
 * records for eval files.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const checkSource = readFileSync(join(root, "scripts/check.mjs"), "utf8");

/** Top-level keys under `jobs:` — NOT every 2-space key (`on:` has `push:`). */
function ciJobs(yml: string): string[] {
  const lines = yml.split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start === -1) throw new Error("ci.yml has no top-level `jobs:` block");
  const jobs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // dedent out of `jobs:`
    const m = /^ {2}([a-z][a-z0-9_-]*):\s*$/.exec(line);
    if (m) jobs.push(m[1]);
  }
  return jobs;
}

/** The `job:` fields of CI_JOBS_NOT_COVERED, read from the source text. */
function declaredNotCovered(src: string): string[] {
  const block = /export const CI_JOBS_NOT_COVERED = \[([\s\S]*?)\n\];/.exec(
    src,
  );
  if (!block)
    throw new Error("check.mjs no longer declares CI_JOBS_NOT_COVERED");
  return [...block[1].matchAll(/\bjob:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("check.mjs accounts for every CI job", () => {
  const jobs = ciJobs(workflow);
  const notCovered = declaredNotCovered(checkSource);

  it("finds the jobs and the declaration (neither parse silently empty)", () => {
    expect(jobs.length).toBeGreaterThan(1);
    expect(notCovered.length).toBeGreaterThan(0);
    expect(jobs).toContain("check"); // the one job check.mjs DOES run
  });

  it("every ci.yml job is either `check` or declared not-covered", () => {
    const accounted = new Set(["check", ...notCovered]);
    expect(jobs.filter((j) => !accounted.has(j))).toEqual([]);
  });

  it("declares no job ci.yml does not have", () => {
    expect(notCovered.filter((j) => !jobs.includes(j))).toEqual([]);
  });

  it("every not-covered entry carries a cmd field and a reason", () => {
    // Split on OBJECT boundaries, not lines: prettier wraps each entry across
    // several lines, and a line-based scan silently checked nothing.
    const block = /export const CI_JOBS_NOT_COVERED = \[([\s\S]*?)\n\];/.exec(
      checkSource,
    )![1];
    const entries = block.split("},").filter((e) => e.includes("job:"));
    expect(entries).toHaveLength(notCovered.length);
    for (const entry of entries) {
      expect(entry, `entry needs a reason: ${entry}`).toMatch(/why:\s*"[^"]+"/);
      expect(entry, `entry needs a cmd field: ${entry}`).toMatch(/cmd:\s*"/);
    }
  });

  it("prints the gap — a green run cannot read as a green CI", () => {
    expect(checkSource).toMatch(/NOT covered here/);
  });
});
