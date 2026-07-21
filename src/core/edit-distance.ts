/**
 * Levenshtein distance for short-string typo detection. Rule names, tool names,
 * and hook events are short, so edit distance is more appropriate than NCD
 * (which is tuned for longer texts).
 *
 * Extracted to its own zero-dependency leaf module so the typo detectors
 * (tool-contract, hook-events) can import it WITHOUT pulling in `core/linters.ts`,
 * which runs a `node:fs`/`process`/`glob` side effect at import time — the
 * blocker to running those detectors in a browser (the in-browser audit demo).
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}
