/**
 * `repoRelative` — the smart constructor that makes an out-of-repo `.gitignore`
 * entry unwritable (#176.8).
 *
 * 🔴 EVERY CASE HAS BOTH HALVES: it refuses what escapes AND mints what belongs.
 * A constructor that returned null for everything would pass a refusal-only
 * suite while silently disabling the feature it guards.
 */
import { describe, it, expect } from "vitest";
import { relative, resolve, isAbsolute, sep } from "node:path";

import { repoRelative } from "./repo-path.js";

const io = { relative, resolve, isAbsolute, sep };
const ROOT = resolve("/repo");

describe("repoRelative", () => {
  it("mints a path inside the repo", () => {
    expect(repoRelative(ROOT, resolve(ROOT, "reports/x.json"), io)).toBe(
      "reports/x.json",
    );
  });

  it("refuses a path that escapes the root", () => {
    // The measured shape: `--out=/tmp/...` produced
    // `../../../../private/tmp/x/vigiles-report.json`, an entry that ignores
    // nothing because .gitignore does not reach outside its own tree.
    expect(repoRelative(ROOT, "/tmp/elsewhere/x.json", io)).toBeNull();
    expect(
      repoRelative(ROOT, resolve(ROOT, "../sibling/x.json"), io),
    ).toBeNull();
  });

  it("refuses the root itself — there is nothing to ignore", () => {
    expect(repoRelative(ROOT, ROOT, io)).toBeNull();
  });

  it("normalizes to POSIX separators", () => {
    // .gitignore patterns are POSIX. A Windows `reports\x` would never match
    // `reports/x` — a second silent miss that lived beside the first.
    const win = {
      ...io,
      sep: "\\",
      relative: () => "reports\\x.json",
      resolve: () => "C:\\repo\\reports\\x.json",
      isAbsolute: () => false,
    };
    expect(repoRelative("C:\\repo", "whatever", win)).toBe("reports/x.json");
  });

  it("a deep path inside the repo is still minted", () => {
    expect(
      repoRelative(ROOT, resolve(ROOT, "a/b/c/vigiles-report.html"), io),
    ).toBe("a/b/c/vigiles-report.html");
  });
});
