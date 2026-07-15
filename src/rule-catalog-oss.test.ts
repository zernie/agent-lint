import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enumeratePylintCatalog } from "./core/rule-catalog.js";
import { routeRules } from "./rule-routing.js";

/**
 * Pylint CATALOG + enabled-state dogfood — drives the REAL `pylint` binary
 * (installed in CI via `pip install ruff pylint`) against a realistic project
 * config, so a regression in `enumeratePylintCatalog` or the "documented but OFF"
 * routing is caught end-to-end, not just at the pure-parse unit layer.
 *
 * The config here is AUTHORED (a small `pyproject.toml` with a `disable` list),
 * not vendored from an OSS repo, and deliberately so: real MIT-licensed Python
 * projects have largely migrated off Pylint to Ruff (sqlalchemy / poetry / rich
 * carry no `[tool.pylint]` config), so an OSS pylint-config slice is genuinely
 * rare. The REAL system under test is the pylint binary + the enumeration/routing
 * code — its behaviour on a real config shape — which the authored config
 * exercises exactly. The FOREIGN-safe routing over real OSS docs is dogfooded
 * separately in rule-routing-oss.test.ts (langchain / browser-use / mcp).
 *
 * Assertions are stable INVARIANTS (a disabled rule reads OFF, an on-by-default
 * rule reads ON, every rule carries a numeric code), never exact counts, so a
 * pylint version bump doesn't break them but a real regression does.
 */

function withPylintProject(config: string, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-pylint-oss-"));
  try {
    writeFileSync(join(dir, "pyproject.toml"), config);
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A realistic config: on-by-default Pylint with two rules explicitly disabled.
const PYPROJECT = `[tool.pylint.messages_control]
disable = ["missing-function-docstring", "too-many-arguments"]

[tool.pylint.format]
max-line-length = 100
`;

// Probe once: is pylint runnable here? (CI installs it; a dev box may not.)
const probe = withProbe();
function withProbe(): ReturnType<typeof enumeratePylintCatalog> {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-pylint-probe-"));
  try {
    writeFileSync(join(dir, "pyproject.toml"), PYPROJECT);
    return enumeratePylintCatalog(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Pylint catalog + enabled-state dogfood (real pylint binary)", () => {
  if (!probe) {
    it.skip("SKIPPED — pylint not runnable in this environment", () => {
      expect(probe).toBeNull();
    });
    return;
  }

  it("enumerates the repo's real message set with numeric-code aliases", () => {
    withPylintProject(PYPROJECT, (dir) => {
      const cat = enumeratePylintCatalog(dir);
      expect(cat).not.toBeNull();
      expect(cat?.linter).toBe("pylint");
      expect(cat?.available).toBeGreaterThan(100);
      // every message carries a Pylint numeric code (C0116, W0611, ...)
      expect(cat?.rules.every((r) => /^[A-Z]\d+$/.test(r.code ?? ""))).toBe(
        true,
      );
    });
  });

  it("reads enabled-state from the real config (disabled rule OFF, default rule ON)", () => {
    withPylintProject(PYPROJECT, (dir) => {
      const cat = enumeratePylintCatalog(dir);
      const byId = new Map(cat?.rules.map((r) => [r.id, r.enabled]));
      // disabled in [tool.pylint.messages_control] -> OFF
      expect(byId.get("missing-function-docstring")).toBe(false);
      expect(byId.get("too-many-arguments")).toBe(false);
      // on by default -> ON
      expect(byId.get("invalid-name")).toBe(true);
      expect(byId.get("unused-import")).toBe(true);
    });
  });

  it('surfaces "documented but OFF": a doc naming a disabled rule routes to reuse with enabled:false', () => {
    withPylintProject(PYPROJECT, (dir) => {
      const availableRules = enumeratePylintCatalog(dir) ?? undefined;
      const doc = [
        "# Conventions",
        "",
        "## Docstrings",
        "",
        "- Require a docstring on every public function (`missing-function-docstring`).",
        "",
        "## Naming",
        "",
        "- Follow naming conventions (`invalid-name`).",
        "",
      ].join("\n");
      const routing = routeRules(doc, "CLAUDE.md", { availableRules });
      const reuse = routing.rules.filter((x) => x.category === "reuse");

      const off = reuse.find((x) => x.rule === "missing-function-docstring");
      expect(
        off,
        "the disabled docstring rule should route to reuse",
      ).toBeTruthy();
      expect(off?.enabled, "and carry enabled:false (documented but OFF)").toBe(
        false,
      );

      const on = reuse.find((x) => x.rule === "invalid-name");
      expect(on?.enabled, "an enabled rule reads enabled:true").toBe(true);
    });
  });
});
