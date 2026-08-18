/**
 * Description-overlap — a DETERMINISTIC proxy for a behavioral risk. Two skills
 * whose descriptions are near-identical can't be told apart by the model's
 * selector, so the wrong one fires (a precision collision). This catches a
 * `--trigger`-class problem with NO model, reusing the NCD engine in proofs.ts
 * (the same one `findSimilarRules` uses) — the bridge between the deterministic
 * and behavioral columns, and a check no other plugin linter has.
 *
 * Calibrated HIGH-PRECISION against the mid-2026 sweep: across 4678 within-plugin
 * skill-description pairs, the MOST-similar legitimately-distinct pair
 * (`create-issue` vs `create-pr`) sits at NCD 0.25, and NOTHING falls below it.
 * So a cutoff of NCD < 0.2 fires only on text that's essentially identical (a
 * copy-pasted description with a word or two changed) — never on a parallel but
 * distinct pair. Warn-level, reports the PAIR (not a unilateral defect).
 */
import { ncd } from "./ncd.js";

/** A skill identified by name + its trigger-surface description. */
export interface DescribedSurface {
  readonly name: string;
  readonly description: string;
  /**
   * Repo-relative path to report the surface at. Optional for callers that have
   * no path, but REQUIRED in practice to keep the message actionable: since the
   * loader started reading BOTH discovery levels, a repo that keeps a copy of a
   * skill in `skills/` and `.claude/skills/` yields two surfaces with the SAME
   * name, and "skills \"dup\" and \"dup\" have near-identical descriptions" names
   * neither file. Measured on `nyldn/claude-octopus`: 50 such pairs. The path is
   * the only thing that distinguishes them.
   */
  readonly where?: string;
}

export interface DescriptionOverlap {
  /** Display label for the first skill — `"name"`, or `"name" (path)`. */
  readonly a: string;
  /** Display label for the second skill — `"name"`, or `"name" (path)`. */
  readonly b: string;
  /** 0–1, higher = more alike (1 − NCD), rounded to 2 dp. */
  readonly similarity: number;
  readonly message: string;
}

/**
 * The NCD cutoff below which two descriptions count as a near-duplicate. 0.2 sits
 * safely under the sweep's most-similar legitimately-distinct pair (0.25), so
 * only basically-identical text is flagged. Exported so a caller / test can see
 * the calibrated value.
 */
export const OVERLAP_NCD_CUTOFF = 0.2;

/**
 * Find near-duplicate description pairs among `surfaces`. Returns one
 * {@link DescriptionOverlap} per pair whose NCD is below `cutoff`, most-similar
 * first. Pure; pass only the surfaces that actually compete for auto-selection
 * (model-invocable, described) so a user-invoked pair isn't a false alarm.
 */
/** `"name"`, or `"name" (path)` when the caller supplied one. */
function label(s: DescribedSurface): string {
  return s.where === undefined ? `"${s.name}"` : `"${s.name}" (${s.where})`;
}

export function findDescriptionOverlaps(
  surfaces: readonly DescribedSurface[],
  cutoff: number = OVERLAP_NCD_CUTOFF,
): DescriptionOverlap[] {
  const overlaps: DescriptionOverlap[] = [];
  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      const d = ncd(surfaces[i].description, surfaces[j].description);
      if (d >= cutoff) continue;
      const a = label(surfaces[i]);
      const b = label(surfaces[j]);
      overlaps.push({
        a,
        b,
        similarity: Math.round((1 - d) * 100) / 100,
        message: `skills ${a} and ${b} have near-identical descriptions (${String(Math.round((1 - d) * 100))}% alike) — the model can't reliably tell them apart, so the wrong one may fire. Differentiate their descriptions.`,
      });
    }
  }
  return overlaps.sort((x, y) => y.similarity - x.similarity);
}
