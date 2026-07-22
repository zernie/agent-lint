import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { CommandBlock } from "@/components/CommandBlock";
import { cn } from "@/lib/utils";

const REPO = "https://github.com/zernie/vigiles";

/**
 * A sticky header that reveals the universal `npx vigiles audit` copy-command
 * once the hero scrolls out of view — so the primary action is always one click
 * away, no scrolling back up. Carries the universal command (not the deeplink,
 * which needs a repo input) so it works for every visitor.
 */
export function StickyCTA() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        // Opaque bg + backdrop blur + a shadow so the bar reads as a distinct
        // floating layer: the blur frosts any content passing under it (a section
        // heading / the combobox otherwise ghosts through behind the wordmark), and
        // the shadow separates it from the scrolling content below.
        "fixed inset-x-0 top-0 z-50 border-b border-border bg-background/95 shadow-lg shadow-black/40 backdrop-blur-md transition-all duration-300",
        show
          ? "translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-full opacity-0",
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <a href="/" className="flex items-center gap-2 no-underline">
          <img
            src="./logo.png"
            alt=""
            className="h-6 w-6 rounded"
            width={24}
            height={24}
          />
          <span className="text-sm font-semibold tracking-tight">vigiles</span>
        </a>
        <div className="flex items-center gap-3">
          <CommandBlock
            command="npx vigiles audit"
            className="px-4 py-2 text-xs sm:text-sm"
          />
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground no-underline transition-colors hover:border-accent/50 hover:text-foreground sm:inline-flex"
          >
            <Star className="h-3.5 w-3.5" aria-hidden />
            Star
          </a>
        </div>
      </div>
    </div>
  );
}
