import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeCommits } from "@semantic-release/commit-analyzer";

/**
 * The release config decides what version a merge ships as. It is configuration,
 * not code, so nothing else in this repo would notice it being wrong — and it WAS
 * wrong, silently, for as long as anyone used the `!` breaking marker.
 *
 * 🔴 MEASURED 2026-08-17. Two PRs merged with `feat!:` titles (#147 renaming the
 * public `skill()` builder, #149 splitting the exports by cost). Under the default
 * ANGULAR preset, `analyzeCommits` returns **null** for `feat!:` — not "minor
 * instead of major", but NO RELEASE AT ALL: the preset does not recognise `feat!`
 * as a type, so no release rule matches. Their code still reached npm, carried by
 * the next commits, under `v15.4.0` (minor) and `v15.4.1` (patch). Breaking
 * changes shipped as a patch bump; anyone on `^15.4.0` took them silently.
 *
 * What makes it a trap rather than a typo: `.github/workflows/pr-title.yml` runs
 * `amannn/action-semantic-pull-request`, which ACCEPTS `feat!` — the `validate`
 * job was green on both PRs. One mechanism told the author the marker was valid
 * while another dropped it, and neither said a word.
 *
 * These cases pin the whole table, not just the fix: a regression to the angular
 * preset turns the first two rows null and fails here.
 */
describe("release preset", () => {
  const root = resolve(import.meta.dirname, "..");
  const ctx = { logger: { log: () => {} }, cwd: root, env: {} };

  /** The plugin options actually shipped in `.releaserc.json`. */
  function analyzerOptions(): Record<string, unknown> {
    const rc = JSON.parse(
      readFileSync(join(root, ".releaserc.json"), "utf8"),
    ) as { plugins: unknown[] };
    for (const p of rc.plugins) {
      if (Array.isArray(p) && p[0] === "@semantic-release/commit-analyzer") {
        return p[1] as Record<string, unknown>;
      }
    }
    throw new Error(
      "commit-analyzer is not configured with options in .releaserc.json — " +
        "a bare string entry means the default (angular) preset, under which " +
        "`feat!:` produces no release at all.",
    );
  }

  async function releaseType(message: string) {
    return analyzeCommits(analyzerOptions(), {
      ...ctx,
      commits: [{ hash: "0".repeat(40), message }],
    });
  }

  it("`feat!:` alone is a MAJOR — the marker the PR-title gate accepts", async () => {
    expect(await releaseType("feat!: split the public exports by COST\n")).toBe(
      "major",
    );
  });

  it("`feat!:` with a prose BREAKING: line is still a MAJOR", async () => {
    // The real #147 body said `BREAKING:`, not the `BREAKING CHANGE:` footer.
    // Under angular that combination was ALSO null — the prose line rescues
    // nothing, which is why the body wording was never the real bug.
    expect(
      await releaseType(
        "feat!: one instability marker\n\nBREAKING: renamed.\n",
      ),
    ).toBe("major");
  });

  it("a `BREAKING CHANGE:` footer without `!` is a MAJOR", async () => {
    expect(
      await releaseType("feat: split\n\nBREAKING CHANGE: input removed.\n"),
    ).toBe("major");
  });

  it("an ordinary `feat:` is a minor", async () => {
    expect(await releaseType("feat(site): add docs links\n")).toBe("minor");
  });

  it("an ordinary `fix:` is a patch", async () => {
    expect(await releaseType("fix(ci): repair the path filter\n")).toBe(
      "patch",
    );
  });

  it("`docs:` releases nothing", async () => {
    // The floor matters as much as the ceiling: a preset that bumped on every
    // commit would pass the rows above and still be wrong.
    expect(await releaseType("docs: tweak a heading\n")).toBeNull();
  });
});
