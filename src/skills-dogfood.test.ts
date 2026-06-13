/**
 * Dogfood — conformance over vigiles's OWN shipped skills (`.claude-plugin/`).
 *
 * The second pillar says "test the harness as the assembled machine it ships as."
 * This points that at us: `loadPlugin` parses our real plugin manifest and
 * materializes every `skills/<name>/SKILL.md`, and we assert the invariants a
 * skill must satisfy to be activatable — it loads, it has a `name`, and it has a
 * non-empty `description` (the surface the model triggers on). Model-free and
 * in-gate (no `claude`, no key), so it runs on every commit.
 *
 * What this tier CANNOT do: prove a description actually *fires* — that's a model
 * decision, the eval tier (`measureTriggerRate`), which needs model auth. The
 * ready-to-run per-skill trigger/outcome evals live under
 * `examples/harness/dogfood/` and are exercised where a key exists. This gate is
 * the free floor: a skill that won't even load can never trigger.
 *
 * Invariants, not trivia: we check "every shipped skill loads with a usable
 * description", not "exactly N skills" (which would break on a harmless add).
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { loadPlugin } from "./plugin-loader.js";

// __dirname is dist/ at runtime; the plugin manifest lives at the repo root.
const ROOT = join(__dirname, "..");

/** name + description from a SKILL.md YAML frontmatter block (the trigger surface). */
function parseFrontmatter(md: string): {
  name?: string;
  description?: string;
} {
  // Tolerate a leading compiled-by comment (`<!-- vigiles:sha256 … -->`) before
  // the `---` block — compiled skills carry it; hand-written ones start at `---`.
  const m = /(?:^|\n)---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return {};
  const name = /^name:\s*(.+)$/m.exec(m[1])?.[1]?.trim();
  const description = /^description:\s*(.+)$/m.exec(m[1])?.[1]?.trim();
  return { name, description };
}

const skillEntries = (files: Record<string, string>): [string, string][] =>
  Object.entries(files).filter(([f]) => /skills\/.*\/SKILL\.md$/.test(f));

test("vigiles plugin: loadPlugin materializes every shipped skill", () => {
  const loaded = loadPlugin(ROOT);
  const skills = skillEntries(loaded.files);

  // every skills/<name>/ directory that actually IS a skill (has a SKILL.md;
  // skills/linter-docs/ is a reference-doc dir, not a skill) shows up
  // materialized — no skill silently dropped by a bad manifest path.
  const onDisk = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(ROOT, "skills", d.name, "SKILL.md"))).length;
  assert.ok(onDisk > 0, "repo ships at least one skill");
  assert.equal(
    skills.length,
    onDisk,
    `expected all ${String(onDisk)} skills to materialize, got ${String(skills.length)}`,
  );

  // ${CLAUDE_PLUGIN_ROOT} must be expanded in the loaded settings (a skill/hook
  // shipping an unresolved placeholder would silently never run).
  assert.ok(
    !JSON.stringify(loaded.settings).includes("${CLAUDE_PLUGIN_ROOT}"),
    "no unresolved ${CLAUDE_PLUGIN_ROOT} placeholder",
  );
});

test("vigiles plugin: every skill has a name and a non-empty description", () => {
  // The description is what the model triggers on — an empty one is a skill that
  // can never fire. This is the cheap floor under the (paid) trigger-rate eval.
  const loaded = loadPlugin(ROOT);
  for (const [path, md] of skillEntries(loaded.files)) {
    const { name, description } = parseFrontmatter(md);
    assert.ok(name && name.length > 0, `${path}: missing frontmatter name`);
    assert.ok(
      description && description.length >= 20,
      `${path}: missing/too-short description (the trigger surface)`,
    );
  }
});
