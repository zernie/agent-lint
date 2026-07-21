/**
 * Persistent grade-cache for the "Grade any repo" demo — an idb-keyval store under
 * a thin TTL/version/LRU policy. It lets a shared `?repo=` deep-link, a reload, or a
 * revisit render a previously-computed grade INSTANTLY and with ZERO GitHub requests
 * (dodging the anonymous 60-req/hr limit), WITHOUT ever showing a silently-stale
 * grade: every hit is age-labelled + one-click re-gradable in the UI.
 *
 * Why idb-keyval (not a reactive useLocalStorage hook): the cache is accessed
 * IMPERATIVELY inside `run()` under a DYNAMIC key (the slug), needs TTL + versioned
 * invalidation + LRU (which no storage hook provides), and stores an AuditReport
 * OBJECT — idb-keyval's structured-clone + per-entry keys fit exactly (no JSON-parse
 * bug class, no whole-object multi-tab race). See research + the Fable design pass.
 *
 * Never throws: every op is best-effort, so a browser with storage disabled (private
 * mode, partitioned iframe) simply runs cache-off — the demo works as it does today.
 */
import { get, set, del, entries } from "idb-keyval";
import { AUDIT_SCHEMA_VERSION } from "@engine/audit-report";
import type { AuditReport } from "@vigiles/report-view";

/** The only outcomes worth persisting: the expensive, shareable, stable ones.
 *  NOT `notfound` (would cache a private repo's name to disk + trap it after it
 *  goes public), NOT `marketplace`/`too-large` (cheap + can flip), NOT transient
 *  `error`/`ratelimit`. Those stay in the session-only in-memory layer. */
export type PersistedView =
  | { k: "report"; slug: string; audit: AuditReport }
  | { k: "empty"; slug: string };

export type GradeHit = { view: PersistedView; gradedAt: number };

/** Namespace: schema version (wire shape) + engine version (detector behaviour,
 *  the git SHA via __ENGINE_V__). Either changing invalidates every prior grade,
 *  so a cached grade an outdated engine produced is never rendered. */
const NS = `vg:${AUDIT_SCHEMA_VERSION}.${__ENGINE_V__}:`;
const TTL_MS = 24 * 60 * 60 * 1000; // 24h — outlives GitHub's hourly window, bounds repo drift to a day
const MAX_ENTRIES = 30;

/** Stored envelope. `gradedAt` drives TTL + the age label; `usedAt` drives LRU —
 *  split on purpose so touching an entry on read never extends its freshness. */
interface Entry {
  gradedAt: number;
  usedAt: number;
  view: PersistedView;
}

const keyFor = (slug: string): string => `${NS}${slug}`;

/**
 * Parse-don't-validate boundary: the ONE place an untrusted stored value becomes a
 * typed `Entry`. Rejects (→ null) a corrupt/foreign shape, a wrong schema version, a
 * future or expired timestamp — so no caller ever sees a stale or malformed grade.
 */
function parseEntry(x: unknown, now: number): Entry | null {
  if (typeof x !== "object" || x === null) return null;
  const { gradedAt, usedAt, view } = x as Record<string, unknown>;
  if (typeof gradedAt !== "number" || !Number.isFinite(gradedAt)) return null;
  if (typeof usedAt !== "number" || !Number.isFinite(usedAt)) return null;
  if (gradedAt > now) return null; // clock skew — fail safe
  if (now - gradedAt > TTL_MS) return null; // expired
  if (typeof view !== "object" || view === null) return null;
  const v = view as Record<string, unknown>;
  if (v.k === "report") {
    if (typeof v.slug !== "string") return null;
    if (typeof v.audit !== "object" || v.audit === null) return null;
    const meta = (v.audit as { meta?: { schemaVersion?: unknown } }).meta;
    if (meta?.schemaVersion !== AUDIT_SCHEMA_VERSION) return null;
    return {
      gradedAt,
      usedAt,
      view: { k: "report", slug: v.slug, audit: v.audit as AuditReport },
    };
  }
  if (v.k === "empty") {
    if (typeof v.slug !== "string") return null;
    return { gradedAt, usedAt, view: { k: "empty", slug: v.slug } };
  }
  return null;
}

/** TTL/shape-checked read; touches `usedAt` (LRU) but not `gradedAt` (TTL).
 *  Deletes a corrupt/expired entry it finds. Returns null on any miss/failure. */
export async function readGrade(slug: string): Promise<GradeHit | null> {
  try {
    const now = Date.now();
    const key = keyFor(slug);
    const raw = await get(key);
    const entry = parseEntry(raw, now);
    if (entry === null) {
      if (raw !== undefined) await del(key);
      return null;
    }
    await set(key, { ...entry, usedAt: now });
    return { view: entry.view, gradedAt: entry.gradedAt };
  } catch {
    return null;
  }
}

/** Best-effort write of a fresh grade; LRU-evicts beyond MAX_ENTRIES. */
export async function writeGrade(view: PersistedView): Promise<void> {
  try {
    const now = Date.now();
    await set(keyFor(view.slug), { gradedAt: now, usedAt: now, view });
    const mine = (await entries()).filter(
      ([k]) => typeof k === "string" && (k as string).startsWith(NS),
    );
    if (mine.length <= MAX_ENTRIES) return;
    const byUse = mine
      .map(([k, v]) => ({
        k: k as string,
        usedAt: parseEntry(v, now)?.usedAt ?? 0,
      }))
      .sort((a, b) => a.usedAt - b.usedAt);
    await Promise.all(
      byUse.slice(0, mine.length - MAX_ENTRIES).map((o) => del(o.k)),
    );
  } catch {
    // a lost write is a lost optimization, not an error
  }
}

/** Fire-and-forget on mount: drop every `vg:`-prefixed key that's a wrong
 *  namespace (old schema/engine) or expired/corrupt in the current one. */
export async function sweepGrades(): Promise<void> {
  try {
    const now = Date.now();
    const stale = (await entries()).filter(([k, v]) => {
      if (typeof k !== "string" || !k.startsWith("vg:")) return false;
      if (!k.startsWith(NS)) return true; // old schema/engine namespace
      return parseEntry(v, now) === null; // expired/corrupt in the current one
    });
    await Promise.all(stale.map(([k]) => del(k as string)));
  } catch {
    // best-effort
  }
}
