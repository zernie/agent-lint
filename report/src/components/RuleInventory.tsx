import { useState } from "react";
import { Check, Copy, ChevronRight, Zap, Sparkles } from "lucide-react";
import type { RuleInventoryItem, RuleRouting, RuleCategory } from "@/schema";
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
  // A contradiction needs a DECISION prompt (the rule is present but disabled),
  // not an "add this line" prompt — the config already mentions it.
  const prompt =
    item.configState === "contradiction"
      ? `In this repo, the ${item.linter} rule \`${item.rule}\` is set to "off" in the lint config, but the instructions document "${item.intent}" as a rule. Resolve the contradiction: either remove the override so \`${item.rule}\` is enforced (${item.configFix}), or drop the documented rule if it's intentionally off.`
      : `In this repo, enable the ${item.linter} rule \`${item.rule}\` (set it to "error") in the lint config, ` +
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
/** The four routing rungs, in ladder order (config-line → hook → prose →
 * compile), with the glyph + one-line meaning the compile CTA lists. */
const ROUTE_META: Record<
  RuleCategory,
  { glyph: string; label: string; blurb: string }
> = {
  reuse: {
    glyph: "↺",
    label: "reuse",
    blurb: "an off-the-shelf rule already exists → enable it",
  },
  hook: {
    glyph: "⛓",
    label: "hook",
    blurb: "action rules a linter can't see (git push, rm -rf)",
  },
  semantic: {
    glyph: "✎",
    label: "prose",
    blurb: "judgment calls, honestly left un-enforced",
  },
  unrouted: {
    glyph: "✨",
    label: "unrouted",
    blurb:
      "no deterministic route — compile decides (reuse / synthesize / prose)",
  },
};
const ROUTE_ORDER: RuleCategory[] = ["reuse", "hook", "semantic", "unrouted"];

/**
 * The opt-in compile tier, grounded in the DETERMINISTIC routing preview when we
 * have one: real per-category counts + a couple of example rules, so the upsell
 * shows the reader THEIR rules routed — not a generic pitch. Falls back to the
 * static description when no routing ran.
 */
function CompileCTA({ routing }: { routing?: RuleRouting }) {
  // One representative example rule per non-reuse category (reuse is already the
  // detailed hero above), quote trimmed for the line.
  const exampleFor = (cat: RuleCategory): string | undefined =>
    routing?.rules.find((r) => r.category === cat)?.text;

  return (
    <div className="rounded-lg border border-dashed border-border p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles size={15} className="text-muted-foreground" />
        Compile — the full picture
        <span className="text-xs font-normal text-muted-foreground">
          opt-in · runs a model once
        </span>
      </div>
      {routing && routing.segmented > 0 ? (
        <>
          <p className="mt-1.5 text-xs text-muted-foreground">
            We segmented{" "}
            <span className="font-semibold text-foreground">
              {routing.segmented}
            </span>{" "}
            atomic {routing.segmented === 1 ? "rule" : "rules"} from your
            instructions and routed each one — deterministically, no model:
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            {ROUTE_ORDER.filter((cat) => routing.counts[cat] > 0).map((cat) => {
              const ex = exampleFor(cat);
              return (
                <li key={cat}>
                  <span className="font-mono text-foreground">
                    {ROUTE_META[cat].glyph} {routing.counts[cat]}{" "}
                    {ROUTE_META[cat].label}
                  </span>{" "}
                  — {ROUTE_META[cat].blurb}
                  {ex && (
                    <span className="mt-0.5 block truncate pl-4 italic opacity-80">
                      e.g. “{ex}”
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 text-xs text-muted-foreground">
            <span className="font-mono text-foreground">compile</span> turns the
            reuse + hook rows into config and hooks, and takes one model pass at
            the <span className="font-mono text-foreground">unrouted</span>{" "}
            rest. CI afterwards is plain lint + hooks — $0 and deterministic.
            <code className="ml-2 rounded bg-border px-1.5 py-0.5 font-mono text-foreground">
              npx vigiles compile
            </code>
          </p>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Segments your instruction file into atomic rules and routes each
            one:
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>
              <span className="font-mono text-foreground">↺ reuse</span> — an
              off-the-shelf rule already exists → enable it
            </li>
            <li>
              <span className="font-mono text-foreground">⚙ synthesize</span> —
              a custom rule, checked against held-out examples before it's
              trusted
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
            One model pass now; CI afterwards is plain lint + hooks — $0 and
            deterministic.
            <code className="ml-2 rounded bg-border px-1.5 py-0.5 font-mono text-foreground">
              npx vigiles compile
            </code>
          </p>
        </>
      )}
    </div>
  );
}

export function RuleInventory({
  data,
  routing,
}: {
  data: RuleInventoryItem[];
  routing?: RuleRouting;
}) {
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
        {/* A tool whose pitch is "your config lies about your rules" must not
            round a maybe up to a yes: `enforced` and `preset-maybe` are counted
            (and coloured) separately. */}
        <p className="text-sm text-muted-foreground">
          <span className={cn("font-semibold", TEXT.good)}>
            {enforced.length}
          </span>{" "}
          of {total} enforced
          {preset.length > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-foreground">
                {preset.length}
              </span>{" "}
              likely via a preset
            </>
          )}
          {oneLine.length > 0 && (
            <>
              {" · "}
              <span className={cn("font-semibold", TEXT.warn)}>
                {oneLine.length}
              </span>{" "}
              {oneLine.length === 1 ? "is" : "are"} one config line away
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
        {seg(enforced.length, BG.good)}
        {seg(preset.length, BG.na)}
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
              label="⛔ set to off in your config — your call"
              action
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
              label="enable in 1 line"
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

      {/* Zone 2 — the opt-in compile tier, grounded in the deterministic routing
          preview (real counts + examples) when present; static pitch otherwise. */}
      <CompileCTA routing={routing} />
    </div>
  );
}
