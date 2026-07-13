import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { RuleInventoryItem } from "@/schema";
import { Card } from "@/components/ui/card";
import { TEXT } from "@/lib/band";
import { cn } from "@/lib/utils";

const BTN =
  "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-left text-xs font-medium hover:border-foreground disabled:opacity-60";

/**
 * Copy a paste-ready agent prompt to the clipboard. vigiles users live in
 * Claude Code / Codex, so the actionable affordance is an instruction the agent
 * can execute — enable the rule in the real config — not a raw JSON snippet the
 * user has to place by hand.
 */
function CopyPrompt({ item }: { item: RuleInventoryItem }) {
  const [copied, setCopied] = useState(false);
  const prompt =
    `In this repo, enable the ${item.linter} rule \`${item.rule}\` (set it to "error") in the lint config, ` +
    `so the documented rule "${item.intent}" is actually enforced. Config to add: ${item.configFix}`;
  const copy = (): void => {
    void navigator.clipboard?.writeText(prompt).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };
  return (
    <button type="button" onClick={copy} title={prompt} className={BTN}>
      {copied ? (
        <Check size={14} className={TEXT.good} />
      ) : (
        <Copy size={14} className="text-muted-foreground" />
      )}
      <span className={cn(copied && TEXT.good)}>
        {copied ? "copied!" : "copy agent prompt"}
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
        // Three states. in-config → enforced (green ✓). preset-maybe → a
        // `recommended` preset likely already enables it, so we neither claim
        // it's off nor nudge (muted, no button — a false "unenforced" alarm on a
        // preset-covered rule is exactly the FP the dogfood exposed).
        // not-in-config → the actionable nudge (amber ●, copyable agent prompt).
        const state = item.configState;
        return (
          <Card
            key={item.rule}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm"
          >
            {state === "in-config" ? (
              <Check size={16} className={TEXT.good} />
            ) : state === "preset-maybe" ? (
              <span className="text-lg leading-none text-muted-foreground">
                ●
              </span>
            ) : (
              <span className={cn("text-lg leading-none", TEXT.warn)}>●</span>
            )}
            <span className="min-w-[12rem] flex-1">{item.intent}</span>
            <code className="font-mono text-xs text-muted-foreground">
              {item.rule}
            </code>
            {state === "in-config" ? (
              <span className={cn("text-xs", TEXT.good)}>enforced</span>
            ) : state === "preset-maybe" ? (
              <span className="text-xs text-muted-foreground">
                likely enforced (preset)
              </span>
            ) : (
              <>
                <span className={cn("text-xs", TEXT.warn)}>
                  documented, not enforced
                </span>
                <CopyPrompt item={item} />
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
