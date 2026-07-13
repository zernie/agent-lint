import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { RuleInventoryItem } from "@/schema";
import { Card } from "@/components/ui/card";
import { TEXT } from "@/lib/band";
import { cn } from "@/lib/utils";

const BTN =
  "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-left text-xs font-medium hover:border-foreground disabled:opacity-60";

/** Copy the one-line config fix to the clipboard (static-report affordance). */
function CopyFix({ fix }: { fix: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard?.writeText(fix).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };
  return (
    <button type="button" onClick={copy} title={`Copy: ${fix}`} className={BTN}>
      {copied ? (
        <Check size={14} className={TEXT.good} />
      ) : (
        <Copy size={14} className="text-muted-foreground" />
      )}
      <span className={cn(copied && TEXT.good)}>
        {copied ? "copied!" : "copy config fix"}
      </span>
    </button>
  );
}

/**
 * The rule-inventory section — documented prose rules that map to an
 * off-the-shelf lint rule. Each row: whether it's already enforced (in the
 * config) or documented-but-not-enforced (with a copyable one-line fix).
 */
export function RuleInventory({ data }: { data: RuleInventoryItem[] }) {
  return (
    <div className="space-y-2">
      {data.map((item) => {
        const enforced = item.configState === "in-config";
        return (
          <Card
            key={item.rule}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm"
          >
            {enforced ? (
              <Check size={16} className={TEXT.good} />
            ) : (
              <span className={cn("text-lg leading-none", TEXT.warn)}>●</span>
            )}
            <span className="min-w-[12rem] flex-1">{item.intent}</span>
            <code className="font-mono text-xs text-muted-foreground">
              {item.rule}
            </code>
            {enforced ? (
              <span className={cn("text-xs", TEXT.good)}>enforced</span>
            ) : (
              <>
                <span className={cn("text-xs", TEXT.warn)}>
                  documented, not enforced
                </span>
                <CopyFix fix={item.configFix} />
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
