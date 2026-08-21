/**
 * The one implementation of "fold the deprecated `result:` into `postcondition:`".
 *
 * 🔴 WHY THIS IS ITS OWN MODULE, and the mistake that produced it. The fold
 * originally lived inside `experimental_skill()` alone, with a comment arguing
 * that normalising "at the door" beats normalising at each reader — because a
 * reader added later would silently read only the new field and drop every spec
 * still on the old one. The argument was right. The identification of the door
 * was wrong: `experimental_skill()` is not the only entrance.
 *
 * `compileSkill()` is public, and it accepts a `SkillSpec` STRUCTURALLY. That
 * interface still advertises `result?: Gate`, so this compiles and is legal:
 *
 *   compileSkill({ _specType: "skill", name, description, body, result: cmd("npm test") })
 *
 * Such a caller never touches the builder, so before this module the `## Result`
 * section and its reference verification were both silently dropped — the exact
 * defect the original comment predicted, arriving through the entrance it did not
 * count. Found by a reviewer, not by me.
 *
 * So: one function, called at BOTH doors. That is not two sources of truth — it
 * is one, used twice. Putting it in spec.ts would have meant either exporting it
 * from `vigiles/spec` (public surface for an internal concern) or duplicating it
 * in compile.ts (the thing being avoided). This module is imported by both and
 * re-exported by neither, so it stays off every api report.
 *
 * ⚠️ IT IMPORTS NOTHING, including from spec.ts, and that is deliberate.
 * `core/spec.ts` is the dependency ROOT of this package — it has zero imports of
 * its own — and spec.ts has to call this. Naming `Gate` here would put a back
 * edge into the root; a type-only import erases at runtime, but the graph would
 * still read as a cycle to anyone (or any lint rule) looking at it. The fold does
 * not care what a gate IS, only which of two properties holds one, so the shape
 * is described structurally and the dependency stays one-directional.
 */

/** Anything carrying the two spellings of a skill's terminal gate. */
interface HasPostcondition<G> {
  readonly postcondition?: G;
  /** @deprecated the old spelling; folded away by {@link foldLegacyPostcondition}. */
  readonly result?: G;
}

/**
 * Return `spec` with `result:` folded into `postcondition:` and `result` removed.
 *
 * Throws when both are set: they are the same field under two names, so which
 * gate runs would otherwise be decided by which branch of the fold ran last —
 * a coin flip in a place where the answer is a gate.
 */
export function foldLegacyPostcondition<G, T extends HasPostcondition<G>>(
  spec: T,
): T {
  // This IS the one place the deprecated field may be read — the fold is what
  // makes the old spelling work at all, so a lint that forbade it everywhere
  // would forbid the alias window itself.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see above
  const { result: legacy, ...rest } = spec;
  if (!legacy) return spec;
  if (rest.postcondition) {
    throw new Error(
      "skill spec sets BOTH `postcondition:` and the deprecated `result:` — " +
        "they are the same field under two names, so which gate runs is a " +
        "coin flip. Keep `postcondition:` and delete `result:`.",
    );
  }
  return { ...rest, postcondition: legacy } as T;
}
