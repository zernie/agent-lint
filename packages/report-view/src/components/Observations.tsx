import { PlaneTakeoff, XCircle } from "lucide-react";
import type { LedgerSummary } from "../schema";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { TEXT, BORDER_L } from "../lib/band";
import { cn } from "../lib/utils";

/**
 * The flight recorder — what the harness actually DID in real sessions, read off
 * the local `.vigiles/runs.jsonl` ledger. Presentational (data-in-props) so the
 * future hosted dashboard reuses it over the same AuditReport contract.
 */
export function Observations({ data }: { data: LedgerSummary }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <PlaneTakeoff size={16} className="text-muted-foreground" />
          {data.total} record{data.total === 1 ? "" : "s"} recorded
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {data.counts.map((c) => (
            <Badge key={c.kind} variant="outline">
              {c.count} {c.kind}
            </Badge>
          ))}
        </div>
      </div>
      {data.recentDenials.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Recent denials ({data.denials})
          </div>
          {data.recentDenials.map((d, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-wrap items-center gap-2 border-l-4 p-3 text-sm",
                BORDER_L["bad"],
              )}
            >
              <XCircle size={14} className={TEXT["bad"]} />
              <code className="font-mono text-xs">{d.label}</code>
              <span className="text-muted-foreground">{d.reason}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
