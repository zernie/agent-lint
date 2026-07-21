/**
 * A no-op-safe analytics shim. The site is static (GitHub Pages), so a
 * script-tag analytics (Plausible/Fathom/GoatCounter) is the eventual home; until
 * one is wired, `track` calls the global if present and is otherwise a silent
 * no-op — so instrumenting the funnel now costs nothing and breaks nothing.
 */
type Plausible = (
  event: string,
  opts?: { props?: Record<string, unknown> },
) => void;

export function track(event: string, props?: Record<string, unknown>): void {
  try {
    const p = (window as unknown as { plausible?: Plausible }).plausible;
    p?.(event, props ? { props } : undefined);
  } catch {
    // analytics must never break the app
  }
}
