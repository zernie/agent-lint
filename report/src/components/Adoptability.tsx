import { CheckCircle2, Link2Off } from "lucide-react";
import type { AdoptabilityResult, BrokenRef } from "@/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BORDER_L, TEXT } from "@/lib/band";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<BrokenRef["kind"], string> = {
  enforce: "rule",
  file: "file",
  cmd: "cmd",
  dir: "dir",
};

function BrokenRefRow({ r }: { r: BrokenRef }) {
  return (
    <div className={cn("border-l-4 p-3", BORDER_L["bad"])}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge>{KIND_LABEL[r.kind]}</Badge>
        <code className="font-mono text-xs text-foreground">{r.ref}</code>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{r.issue}</div>
    </div>
  );
}

export function Adoptability({ data }: { data: AdoptabilityResult }) {
  if (data.total === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        No machine-verifiable references found — add{" "}
        <code className="font-mono text-xs">enforce()</code> calls to a{" "}
        <code className="font-mono text-xs">.spec.ts</code> to unlock
        cross-referencing.
      </Card>
    );
  }

  const allGood = data.broken === 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-3xl font-bold tabular-nums",
              allGood ? TEXT["good"] : TEXT["bad"],
            )}
          >
            {data.broken}
          </span>
          <span className="text-sm text-muted-foreground">
            / {data.total} broken
          </span>
        </div>
        {allGood ? (
          <span className={cn("flex items-center gap-1 text-sm", TEXT["good"])}>
            <CheckCircle2 size={14} /> all {data.total} reference
            {data.total === 1 ? "" : "s"} resolve
          </span>
        ) : (
          <span className={cn("flex items-center gap-1 text-sm", TEXT["bad"])}>
            <Link2Off size={14} /> {data.broken} broken reference
            {data.broken === 1 ? "" : "s"} found
          </span>
        )}
      </div>

      {data.brokenRefs.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {data.brokenRefs.map((r, i) => (
            <BrokenRefRow key={i} r={r} />
          ))}
        </div>
      )}
    </Card>
  );
}
