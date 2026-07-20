import { useSyncExternalStore } from "react";
import { Terminal } from "lucide-react";
import { getToasts, subscribeToasts } from "@/lib/toast";

/**
 * Renders the active toasts. Mount once (in App). Fixed to the bottom on mobile
 * (thumb-reachable, clear of the top address bar) and stacks upward.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-lg"
        >
          <Terminal
            className="mt-0.5 h-4 w-4 shrink-0 text-accent"
            aria-hidden
          />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
