import { ShieldCheck } from "lucide-react";
import { CommandBlock } from "@/components/CommandBlock";
import { cn } from "@/lib/utils";

/**
 * The hero CTA — command-first. The one action that works for EVERYONE (any
 * OS, any terminal, mobile included as "run it on your computer") is
 * `npx vigiles audit`, so that's the star. The live "grade any repo" demo lives
 * lower in the `#try` section (DemoAudit) — this just links down to it, rather
 * than leading with a button that dead-ends on mobile / without Claude Code.
 */
export function AuditWidget({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex w-full max-w-xl flex-col items-center", className)}
    >
      {/* Primary action — the universal command. */}
      <CommandBlock
        command="npx vigiles audit"
        className="w-full justify-center py-4 text-base"
      />

      <p className="mt-3 flex items-start justify-center gap-1.5 text-sm leading-relaxed text-muted-foreground">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-good"
          aria-hidden
        />
        <span>
          Auto-detects Claude Code or Codex.{" "}
          <span className="text-foreground/70">Nothing is uploaded.</span>
        </span>
      </p>
    </div>
  );
}
