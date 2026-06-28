import { useState } from "react";
import { Check, Copy, FilePlus2 } from "lucide-react";
import type { Adoptable } from "@/schema";
import { Card } from "@/components/ui/card";
import { TEXT } from "@/lib/band";
import { cn } from "@/lib/utils";

/**
 * A copy-to-clipboard affordance for a CLI command. The report is a browser app —
 * it CANNOT write files (no spec creation here), so the adoption story is to EMIT
 * the exact `npx vigiles init` command for the user to paste. Presentational
 * (data-in-props); shows a brief "copied!" confirmation.
 */
function CopyCommand({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard?.writeText(command).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy: ${command}`}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-left text-xs font-medium hover:border-foreground"
    >
      {copied ? (
        <Check size={14} className={TEXT["good"]} />
      ) : (
        <Copy size={14} className="text-muted-foreground" />
      )}
      <span className={cn(copied && TEXT["good"])}>
        {copied ? "copied!" : label}
      </span>
    </button>
  );
}

function SurfaceRow({ path, command }: { path: string; command: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-l-4 border-l-warn p-3">
      <code className="font-mono text-xs text-foreground">{path}</code>
      <div className="ml-auto">
        <CopyCommand command={command} label="Create spec" />
      </div>
    </div>
  );
}

/**
 * The "adoptable surfaces" section — surfaces that exist but aren't spec-managed
 * yet. A header "Create all specs" button copies `npx vigiles init`; each row
 * copies the per-surface `npx vigiles init --target=<path>`. Command emitters,
 * never writers (the browser can't write files).
 */
export function Adopt({ data }: { data: Adoptable }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FilePlus2 size={16} className="text-muted-foreground" />
          {data.surfaces.length} surface
          {data.surfaces.length === 1 ? "" : "s"} not yet spec-managed
        </div>
        <div className="ml-auto">
          <CopyCommand
            command={data.createAllCommand}
            label="Create all specs"
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Copy the command and run it in your terminal — the CLI writes the typed
        spec (the browser can&apos;t write files).
      </p>
      {data.surfaces.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {data.surfaces.map((s) => (
            <SurfaceRow key={s.path} path={s.path} command={s.command} />
          ))}
        </div>
      )}
    </Card>
  );
}
