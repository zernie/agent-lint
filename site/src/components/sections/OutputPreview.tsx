import { Badge } from "@/components/ui/badge";
import auditReport from "@/assets/vigiles-audit.png";

/**
 * "Here's what you get" — the real audit report screenshot (the same asset the
 * README uses), so the landing shows the actual output, not just the pitch.
 */
export function OutputPreview() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
      <div className="reveal text-center">
        <Badge className="mb-4">What you get</Badge>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          One command. A graded report — with the fixes.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          A verdict, five weighted categories, and every finding paired with its
          one-line fix — as a shareable HTML report (plus{" "}
          <span className="font-mono text-foreground">--json</span> for CI).
        </p>
      </div>
      <div className="reveal mt-10 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <img
          src={auditReport}
          alt="A vigiles audit report for 'my-plugin': a verdict header, a C (77/100) grade, a five-category strip (Truthfulness, Triggering, Structure, Safety, Tested), ranked fix cards with '+N pts' impact badges, and broken-reference findings."
          className="block w-full"
          loading="lazy"
        />
      </div>
    </section>
  );
}
