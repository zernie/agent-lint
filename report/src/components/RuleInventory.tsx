import { useState } from "react";
import { Check, Copy, ChevronRight, Zap, Sparkles } from "lucide-react";
import type { RuleInventoryItem } from "@/schema";
import { Card } from "@/components/ui/card";
import { TEXT, BG } from "@/lib/band";
import { cn } from "@/lib/utils";

const BTN =
  "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-left text-xs font-medium hover:border-foreground disabled:opacity-60";

/**
 * Copy a paste-ready agent prompt to the clipboard. vigiles users live in
 * Claude Code / Codex, so the actionable affordance is an instruction the agent
 * can execute — enable the rule in the real config — not a raw JSON snippet.
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

/** One rule row. `tone` drives the leading dot/check + the trailing label. */
function RuleRow({
  item,
  tone,
  label,
  action,
}: {
  item: RuleInventoryItem;
  tone: "good" | "warn" | "bad" | "muted";
  label: string;
  action?: boolean;
}) {
  return (
    <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
      {tone === "good" ? (
        <Check size={16} className={TEXT.good} />
      ) : (
        <span
          className={cn(
            "text-lg leading-none",
            tone === "warn"
              ? TEXT.warn
              : tone === "bad"
                ? TEXT.bad
                : "text-muted-foreground",
          )}
        >
          ●
        </span>
      )}
      <span className="min-w-[12rem] flex-1">{item.intent}</span>
      <code className="font-mono text-xs text-muted-foreground">
        {item.rule}
      </code>
      <span
        className={cn(
          "text-xs",
          tone === "good"
            ? TEXT.good
            : tone === "warn"
              ? TEXT.warn
              : tone === "bad"
                ? TEXT.bad
                : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      {action && <CopyPrompt item={item} />}
    </Card>
  );
}

/** A collapsed group whose count is always visible (green/preset rows fold away
 * so the actionable rows stay on top). */
function FoldedGroup({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "good" | "muted";
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-medium",
          tone === "good" ? TEXT.good : "text-muted-foreground",
        )}
      >
        <ChevronRight
          size={13}
          className="transition-transform group-open:rotate-90"
        />
        {title}
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

/**
 * The Rules section — the report's hero for the "prose → enforced" story. Two
 * honest zones:
 *   1. Deterministic scan (no model) — documented rules that map to an
 *      off-the-shelf lint rule, grouped by state so the actionable ones lead.
 *   2. A compile CTA describing the opt-in tier — never fabricated result rows.
 */
export function RuleInventory({ data }: { data: RuleInventoryItem[] }) {
  const enforced = data.filter((r) => r.configState === "in-config");
  const preset = data.filter((r) => r.configState === "preset-maybe");
  const oneLine = data.filter((r) => r.configState === "not-in-config");
  const contradiction = data.filter((r) => r.configState === "contradiction");
  const total = data.length;

  // 100% stacked distribution bar — makes N rows read as a system, not a stub.
  const seg = (n: number, bg: string) =>
    n > 0 ? (
      <div className={cn(bg)} style={{ flexGrow: n }} aria-hidden />
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {enforced.length + preset.length} of {total}
          </span>{" "}
          documented rules are enforced
          {oneLine.length > 0 && (
            <>
              {" · "}
              <span className={cn("font-semibold", TEXT.warn)}>
                {oneLine.length}
              </span>{" "}
              one config line away
            </>
          )}
          {contradiction.length > 0 && (
            <>
              {" · "}
              <span className={cn("font-semibold", TEXT.bad)}>
                {contradiction.length}
              </span>{" "}
              contradicted by config
            </>
          )}
          .
        </p>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Zap size={12} /> deterministic · no model
        </span>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-border">
        {seg(enforced.length + preset.length, BG.good)}
        {seg(oneLine.length, BG.warn)}
        {seg(contradiction.length, BG.bad)}
      </div>

      {/* Contradiction — the "your docs say enforce it, your config turns it off"
          row. Most interesting single finding; shown, never nudged on. */}
      {contradiction.length > 0 && (
        <div className="space-y-2">
          {contradiction.map((item) => (
            <RuleRow
              key={item.rule}
              item={item}
              tone="bad"
              label="⛔ config turns it OFF — your call"
            />
          ))}
        </div>
      )}

      {/* One line away — the actionable group, open on top. */}
      {oneLine.length > 0 && (
        <div className="space-y-2">
          {oneLine.map((item) => (
            <RuleRow
              key={item.rule}
              item={item}
              tone="warn"
              label="1-line fix"
              action
            />
          ))}
        </div>
      )}

      {enforced.length > 0 && (
        <FoldedGroup
          title={`✓ ${enforced.length} already enforced`}
          tone="good"
        >
          {enforced.map((item) => (
            <RuleRow key={item.rule} item={item} tone="good" label="enforced" />
          ))}
        </FoldedGroup>
      )}

      {preset.length > 0 && (
        <FoldedGroup
          title={`◦ ${preset.length} likely enforced via a preset`}
          tone="muted"
        >
          {preset.map((item) => (
            <RuleRow key={item.rule} item={item} tone="muted" label="preset?" />
          ))}
        </FoldedGroup>
      )}

      {/* Zone 2 — the opt-in compile tier. Describes what it does; NO fabricated
          result rows until it actually runs (honest by construction). */}
      <div className="rounded-lg border border-dashed border-border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={15} className="text-muted-foreground" />
          Compile — the full picture
          <span className="text-xs font-normal text-muted-foreground">
            opt-in · runs a model once
          </span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Segments your instruction file into atomic rules and routes each one:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>
            <span className="font-mono text-foreground">↺ reuse</span> — an
            off-the-shelf rule already exists → enable it
          </li>
          <li>
            <span className="font-mono text-foreground">⚙ synthesize</span> — a
            custom rule, blind-gated before it's trusted
          </li>
          <li>
            <span className="font-mono text-foreground">⛓ hook</span> — action
            rules a linter can't see (git push, rm -rf)
          </li>
          <li>
            <span className="font-mono text-foreground">✎ prose</span> —
            judgment calls, honestly left un-enforced
          </li>
        </ul>
        <p className="mt-2.5 text-xs text-muted-foreground">
          CI afterwards is plain lint + hooks. $0, deterministic.
          <code className="ml-2 rounded bg-border px-1.5 py-0.5 font-mono text-foreground">
            npx vigiles compile
          </code>
        </p>
      </div>
    </div>
  );
}
