import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/40 text-muted-foreground",
        accent: "border-accent/40 bg-accent/10 text-accent",
        signal: "border-signal/40 text-signal",
        good: "border-good/40 text-good",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
