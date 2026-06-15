/**
 * vigiles — significance testing for eval A/B arms.
 *
 * The eval tier already reports mean ± se per arm; this answers the question that
 * `assertImproves(..., { by: se })` punted to the user: is the gap between two
 * arms real, or noise? A Welch's t-test over the per-arm summary stats (mean, se,
 * n) — no raw rows needed — yields a two-sided p-value and a significance verdict.
 * Pure + model-free, so it's fully unit-tested against known t-table values.
 *
 * For 0/1 (proportion) metrics this is the t approximation to the two-proportion
 * test — close at the trial counts evals use, and one code path for any metric.
 * The numerics (log-gamma, incomplete beta) are specialized to the argument range
 * these tests produce (a, b ≥ 0.5; x ∈ (0,1)); they are not a general library.
 */
import type { EvalReport } from "./eval.js";

// Lanczos coefficients (g = 7) for log-gamma; sufficient for the beta args here.
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Log-gamma via Lanczos. Valid for x ≥ 0.5 (all args used below satisfy this). */
function lgamma(x: number): number {
  const g = 7;
  const xm1 = x - 1;
  const base = LANCZOS.reduce(
    (acc, c, i) => acc + c / (xm1 + i + 1),
    0.99999999999980993,
  );
  const tt = xm1 + g + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (xm1 + 0.5) * Math.log(tt) -
    tt +
    Math.log(base)
  );
}

/** Continued fraction for the incomplete beta (Numerical Recipes betacf). */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 1e-12;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 / (1 - (qab * x) / qap);
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 / (1 + aa * d);
    c = 1 + aa / c;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 / (1 + aa * d);
    c = 1 + aa / c;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b) ∈ [0, 1]. */
export function regularizedIncompleteBeta(
  a: number,
  b: number,
  x: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    lgamma(a + b) -
      lgamma(a) -
      lgamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betacf(a, b, x)) / a
    : 1 - (front * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value for Student's t with `df` degrees of freedom. */
export function tPValueTwoSided(t: number, df: number): number {
  if (df <= 0) return 1;
  return regularizedIncompleteBeta(df / 2, 0.5, df / (df + t * t));
}

/** The verdict on one arm-vs-baseline comparison for a single metric. */
export interface Comparison {
  /** mean(arm) − mean(baseline). */
  readonly delta: number;
  /** Combined standard error of the difference. */
  readonly seDelta: number;
  /** Welch t statistic (delta / seDelta). */
  readonly t: number;
  /** Welch–Satterthwaite degrees of freedom. */
  readonly df: number;
  /** Two-sided p-value for the difference. */
  readonly pValue: number;
  /** p < alpha — the difference is unlikely to be noise. */
  readonly significant: boolean;
}

type Summary = {
  readonly mean: number;
  readonly se: number;
  readonly n: number;
};

// Variance contribution of one arm to the Welch df denominator. Guarded by v > 0
// (se > 0 ⇒ n ≥ 2, so n − 1 ≥ 1); a deterministic arm (se = 0) contributes 0.
const dfTerm = (v: number, n: number): number =>
  v > 0 ? (v * v) / (n - 1) : 0;

/** Welch's unequal-variance t-test between two arms' summary stats. */
export function welchTTest(
  arm: Summary,
  baseline: Summary,
  alpha = 0.05,
): Comparison {
  const delta = arm.mean - baseline.mean;
  const va = arm.se ** 2;
  const vb = baseline.se ** 2;
  const seDelta = Math.sqrt(va + vb);
  if (seDelta === 0) {
    // Both arms are deterministic: significant iff they differ at all.
    const significant = delta !== 0;
    return {
      delta,
      seDelta,
      t: 0,
      df: 0,
      pValue: significant ? 0 : 1,
      significant,
    };
  }
  const t = delta / seDelta;
  const df = (va + vb) ** 2 / (dfTerm(va, arm.n) + dfTerm(vb, baseline.n));
  const pValue = tPValueTwoSided(t, df);
  return { delta, seDelta, t, df, pValue, significant: pValue < alpha };
}

/**
 * Compare two arms on a metric using their reported summary stats, or null if
 * either arm/metric is absent. The grounded form of `assertImproves`'s `by`: it
 * computes the noise floor instead of asking the caller to supply it.
 */
export function compareArms(
  report: EvalReport,
  baseline: string,
  arm: string,
  metric: string,
  alpha = 0.05,
): Comparison | null {
  const a = report.arms[arm]?.stats[metric];
  const b = report.arms[baseline]?.stats[metric];
  if (!a || !b) return null;
  return welchTTest(a, b, alpha);
}
