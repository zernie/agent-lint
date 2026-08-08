import { createHash } from "node:crypto";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A fingerprint of the BUILT engine (`dist/`), used to key the browser-test
 * dependency-prebundle cache so a stale prebundle is unrepresentable.
 *
 * ## Why this exists
 *
 * `site/vitest.config.ts` pre-bundles `@engine/scan-files` and
 * `@engine/audit-report` — the repo-root `dist/` CJS — via `optimizeDeps`, and
 * Vite caches the result under `site/node_modules/.vite`. That cache SURVIVES
 * `npm run build`: Vite invalidates it on config/lockfile changes, not on the
 * mtimes of an aliased path outside `node_modules`. So the browser side can run
 * against a PREVIOUS engine while Node runs against the current one, and
 * `browser-parity.browser.test.ts` then fails with a field-level diff that looks
 * EXACTLY like a genuine pako-vs-node:zlib divergence.
 *
 * Observed 2026-08-07: after an engine change added a report field, the parity
 * test failed showing the field present on the Node side and absent on the
 * browser side. That was read aloud as a real engine divergence and a hunt began
 * for a parity bug that did not exist. `rm -rf site/node_modules/.vite` → 42/42.
 *
 * ## Why a cache KEY and not a staleness check
 *
 * The alternatives were: compare the cache's mtime against `dist/` and force a
 * re-bundle when it loses, or clear `.vite` in the test script. Both work, and
 * both leave a state that has to be DETECTED — a comparison someone can get
 * wrong, or a script step someone can bypass by running `vitest` directly. Keying
 * the cache DIRECTORY on the engine fingerprint removes the state instead: a
 * different `dist/` is a different cache path, so "prebundle built from another
 * engine" cannot be reached, and an unchanged `dist/` still gets a warm cache. By
 * construction rather than by check — the same argument this project makes about
 * removing a capability instead of policing its use.
 */
export function engineStamp(distDir: string): string {
  const hash = createHash("sha1");
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
        a.name < b.name ? -1 : 1,
      );
    } catch {
      // No dist yet (a fresh clone running tests before `npm run build`). An
      // empty stamp is honest: there is no engine to be stale against.
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (e.name.endsWith(".js")) {
        const s = statSync(p);
        hash.update(`${p}:${String(s.size)}:${String(s.mtimeMs)}\n`);
      }
    }
  };
  walk(distDir);
  return hash.digest("hex").slice(0, 12);
}

/**
 * Delete the prebundle caches keyed to OTHER engine fingerprints, so keying the
 * directory doesn't turn into an unbounded pile of them under `node_modules`.
 * Best-effort: a failure here costs disk, never correctness.
 */
export function sweepStaleEngineCaches(
  nodeModulesDir: string,
  keep: string,
): void {
  try {
    for (const name of readdirSync(nodeModulesDir)) {
      if (name.startsWith(".vite-engine-") && name !== keep) {
        rmSync(join(nodeModulesDir, name), { recursive: true, force: true });
      }
    }
  } catch {
    /* no node_modules yet, or a read-only FS — nothing to sweep */
  }
}
