import * as React from "react";
import { cn } from "@/lib/utils";

// shadcn-style Card (plain div, no Radix) — the report's surface primitive.
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card text-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
