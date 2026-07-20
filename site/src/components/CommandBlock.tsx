import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** A monospace command block with copy-on-click. */
export function CommandBlock({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy command: ${command}`}
      className={cn(
        "group inline-flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3.5 font-mono text-sm sm:text-base text-foreground transition-colors hover:border-accent/50",
        className,
      )}
    >
      <span className="select-none text-muted-foreground">$</span>
      <span className="tracking-tight">{command}</span>
      <span className="ml-1 text-muted-foreground transition-colors group-hover:text-accent">
        {copied ? (
          <Check className="h-4 w-4 text-good" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
      </span>
    </button>
  );
}
