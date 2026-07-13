/**
 * Score → band → Tailwind utility classes. Class names are LITERAL (not built by
 * string concat) so Tailwind's JIT detects and emits them. The band colors are
 * registered as theme colors in index.css (`--color-good/warn/bad/na`), so these
 * are first-class Tailwind utilities — no inline styles, no arbitrary `[var()]`.
 */
export type Band = "good" | "warn" | "bad" | "na";

export function band(score: number | null): Band {
  if (score === null) return "na";
  if (score >= 90) return "good";
  if (score >= 70) return "warn";
  return "bad";
}

export const TEXT: Record<Band, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  na: "text-na",
};
export const BG: Record<Band, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  na: "bg-na",
};
export const STROKE: Record<Band, string> = {
  good: "stroke-good",
  warn: "stroke-warn",
  bad: "stroke-bad",
  na: "stroke-na",
};
export const FILL: Record<Band, string> = {
  good: "fill-good",
  warn: "fill-warn",
  bad: "fill-bad",
  na: "fill-na",
};
export const BORDER_L: Record<Band, string> = {
  good: "border-l-good",
  warn: "border-l-warn",
  bad: "border-l-bad",
  na: "border-l-na",
};
/** Full (all-sides) band border — literal class names so the JIT emits them. */
export const BORDER: Record<Band, string> = {
  good: "border-good",
  warn: "border-warn",
  bad: "border-bad",
  na: "border-na",
};
