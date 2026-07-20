/**
 * A tiny dependency-free toast store (external store + useSyncExternalStore).
 * One `<Toaster />` is mounted in App; anything can fire `toast(message)` —
 * used to give the deeplink CTA visible feedback when Claude Code can't open.
 */

export type Toast = { id: number; message: string };

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit(): void {
  for (const listener of listeners) listener();
}

/** Show a transient notification. Returns nothing; auto-dismisses after `ttl`. */
export function toast(message: string, ttl = 4000): void {
  const id = nextId++;
  toasts = [...toasts, { id, message }];
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, ttl);
}

export function subscribeToasts(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Stable snapshot: the same array reference until `emit` reassigns it. */
export function getToasts(): Toast[] {
  return toasts;
}
