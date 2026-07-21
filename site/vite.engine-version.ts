import { execSync } from "node:child_process";

/**
 * Build-time cache-bust token for the persistent grade-cache namespace.
 *
 * The audit engine's behaviour changes ship as commits, so the short git SHA is
 * the honest signal that "the engine that produced a cached grade is no longer
 * the engine running now" — a new deploy → a new SHA → old cached grades are
 * swept, so the demo never renders a grade an outdated engine computed. (The root
 * `package.json` version is a release-time placeholder in-repo, so it can't serve
 * this.) Over-invalidation is safe (a stale grade is the only real hazard); the
 * cost is a re-fetch after a deploy. Falls back to `dev` when git is unavailable.
 */
export const ENGINE_VERSION: string = (() => {
  try {
    return (
      execSync("git rev-parse --short HEAD", {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim() || "dev"
    );
  } catch {
    return "dev";
  }
})();
