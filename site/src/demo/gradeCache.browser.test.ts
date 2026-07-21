/**
 * gradeCache tests — real Chromium, so real IndexedDB (idb-keyval), no mocks.
 * Proves the policy layer: round-trip, TTL expiry, corrupt tolerance, wrong-
 * namespace sweep, and the LRU cap.
 */
import { beforeEach, describe, it, expect } from "vitest";
import { clear, entries, set, get } from "idb-keyval";
import type { AuditReport } from "@vigiles/report-view";
import { AUDIT_SCHEMA_VERSION } from "@engine/audit-report";
import { readGrade, writeGrade, sweepGrades } from "./gradeCache";

beforeEach(async () => {
  await clear();
});

/** A minimal report whose schemaVersion matches (so parseEntry accepts it). */
const report = (slug: string): AuditReport =>
  ({ meta: { schemaVersion: AUDIT_SCHEMA_VERSION, dir: slug } }) as AuditReport;

describe("gradeCache", () => {
  it("round-trips a report and an empty grade", async () => {
    await writeGrade({ k: "report", slug: "a/b", audit: report("a/b") });
    const hit = await readGrade("a/b");
    expect(hit?.view.k).toBe("report");
    expect(typeof hit?.gradedAt).toBe("number");

    await writeGrade({ k: "empty", slug: "c/d" });
    expect((await readGrade("c/d"))?.view.k).toBe("empty");

    expect(await readGrade("never/graded")).toBeNull();
  });

  it("expires an entry past its TTL (and deletes it)", async () => {
    await writeGrade({ k: "empty", slug: "old/repo" });
    // Age the stored entry past 24h without hardcoding the namespace key.
    const [[key, val]] = (await entries()).filter(([k]) =>
      String(k).includes("old/repo"),
    );
    await set(key, {
      ...(val as object),
      gradedAt: Date.now() - 25 * 60 * 60 * 1000,
    });
    expect(await readGrade("old/repo")).toBeNull();
    expect(await get(key)).toBeUndefined(); // expired read cleans up
  });

  it("rejects a corrupt / wrong-schema entry", async () => {
    await writeGrade({ k: "report", slug: "x/y", audit: report("x/y") });
    const [[key]] = (await entries()).filter(([k]) =>
      String(k).includes("x/y"),
    );
    // Wrong schema version → parseEntry rejects.
    await set(key, {
      gradedAt: Date.now(),
      usedAt: Date.now(),
      view: {
        k: "report",
        slug: "x/y",
        audit: { meta: { schemaVersion: 999 } },
      },
    });
    expect(await readGrade("x/y")).toBeNull();
  });

  it("sweeps a stale wrong-namespace key but keeps a valid current one", async () => {
    await set("vg:1.oldsha:legacy/repo", {
      gradedAt: Date.now(),
      usedAt: Date.now(),
    });
    await writeGrade({ k: "empty", slug: "fresh/repo" });
    await sweepGrades();
    expect(await get("vg:1.oldsha:legacy/repo")).toBeUndefined();
    expect((await readGrade("fresh/repo"))?.view.k).toBe("empty");
  });

  it("caps the store at the LRU limit", async () => {
    for (let i = 0; i < 35; i += 1) {
      await writeGrade({ k: "empty", slug: `owner/repo-${i}` });
    }
    const mine = (await entries()).filter(([k]) => String(k).startsWith("vg:"));
    expect(mine.length).toBeLessThanOrEqual(30);
    // The most-recently-written survive; the oldest were evicted.
    expect((await readGrade("owner/repo-34"))?.view.k).toBe("empty");
    expect(await readGrade("owner/repo-0")).toBeNull();
  });
});
