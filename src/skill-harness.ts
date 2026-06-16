/**
 * Cross-harness skill-frontmatter verification (slice 3 of
 * research/multi-harness-compile.md, the *verify* half).
 *
 * A skill's `SKILL.md` references are harness-agnostic; the one harness-specific
 * surface is the frontmatter PROFILE. The `claude-code` profile emits CC-only
 * keys (`disable-model-invocation`, `argument-hint`); the `minimal` profile
 * (Codex, OpenCode) omits them. So a skill that sets those keys, in a repo that
 * also targets a minimal-profile harness, has a silent semantic gap: the
 * constraint the author expressed won't take effect there.
 *
 * This reports that gap. It is ASSUMPTION-FREE — the minimal profile *drops* the
 * keys, so the warning states a fact about vigiles's own output, not a guess
 * about another tool's parser tolerance.
 */
import type { SkillSpec } from "./core/spec.js";
import { getAdapter } from "./adapter-registry.js";

/** The Claude-Code-only frontmatter keys a skill spec would emit. */
export function claudeOnlyFrontmatterKeys(spec: SkillSpec): string[] {
  const keys: string[] = [];
  if (spec.disableModelInvocation !== undefined) {
    keys.push("disable-model-invocation");
  }
  if (spec.argumentHint || (spec.inputs && spec.inputs.length > 0)) {
    keys.push("argument-hint");
  }
  return keys;
}

/**
 * Warn for each declared harness whose `minimal` SKILL.md profile would DROP a
 * skill's Claude-Code-only frontmatter. Empty when the skill uses no such keys or
 * no declared harness is minimal-profile.
 */
export function skillFrontmatterDropWarnings(
  spec: SkillSpec,
  harnessNames: readonly string[],
): string[] {
  const ccKeys = claudeOnlyFrontmatterKeys(spec);
  if (ccKeys.length === 0) return [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const name of harnessNames) {
    const adapter = getAdapter(name);
    if (!adapter || seen.has(adapter.name)) continue;
    seen.add(adapter.name);
    if (adapter.dialect.skillFrontmatter === "minimal") {
      const one = ccKeys.length === 1;
      warnings.push(
        `skill "${spec.name}": ${ccKeys.join(", ")} ${one ? "is" : "are"} Claude-Code-only — declared harness "${adapter.name}" drops ${one ? "it" : "them"}.`,
      );
    }
  }
  return warnings;
}
