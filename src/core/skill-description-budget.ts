/**
 * Skill-description budget — a DETERMINISTIC proxy for a behavioral risk, and the
 * deterministic sibling of {@link findDescriptionOverlaps}. A model-invocable
 * skill is selected on its `description`, and the selector weighs the OPENING of
 * it most; a long, buried description dilutes the trigger signal and degrades
 * both recall ("did it fire when it should?") and precision ("did it stay quiet
 * when it shouldn't?"). This catches a trigger-class problem with NO model.
 *
 * HEURISTIC-BEHAVIORAL bucket: the threshold is a PROXY (no character count
 * PROVES a description triggers badly), so the ceiling is WARN — it never gates.
 * Calibrated FP-safe: the default budget (500 chars) sits well above a normal
 * one-to-three-sentence description, so only a genuinely bloated description
 * fires. Reports the per-skill overflow, never a unilateral defect.
 */

/** A skill identified by name + its trigger-surface description. */
export interface BudgetedSurface {
  readonly name: string;
  readonly description: string;
}

export interface DescriptionBudgetIssue {
  readonly name: string;
  /** Length of the description in characters. */
  readonly length: number;
  /** The budget it exceeded. */
  readonly budget: number;
  readonly message: string;
}

/**
 * The default description-length budget, in characters. A concise what+when
 * description is comfortably under this; only a bloated one (multiple long
 * sentences, embedded examples, disambiguation prose) exceeds it. Generous on
 * purpose — warn-tier, don't cry wolf. Exported so a caller / test sees it.
 */
export const DEFAULT_DESCRIPTION_BUDGET = 500;

/**
 * Find model-invocable skills whose `description` exceeds `budget` characters.
 * Returns one {@link DescriptionBudgetIssue} per over-budget skill, longest
 * first. Pure; pass only the surfaces that compete for auto-selection
 * (model-invocable, described) so a user-invoked skill isn't a false alarm.
 */
export function findDescriptionBudgetIssues(
  surfaces: readonly BudgetedSurface[],
  budget: number = DEFAULT_DESCRIPTION_BUDGET,
): DescriptionBudgetIssue[] {
  const issues: DescriptionBudgetIssue[] = [];
  for (const s of surfaces) {
    const length = Array.from(s.description).length;
    if (length <= budget) continue;
    issues.push({
      name: s.name,
      length,
      budget,
      message: `skill "${s.name}" has a ${String(length)}-char description (budget ${String(budget)}) — the selector weighs the opening most, so a long description buries the trigger signal and hurts recall + precision. Tighten it to a concise what + when.`,
    });
  }
  return issues.sort((a, b) => b.length - a.length);
}
