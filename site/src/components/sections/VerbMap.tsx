import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/** The four verbs over one engine — the "one tool, not four" frame. Each row: the
 *  command, what it answers, whether it needs a model, when you run it. */
const VERBS: {
  verb: string;
  answers: string;
  model: string;
}[] = [
  {
    verb: "audit",
    answers: "Everything, graded A–F",
    model: "no model · read-only · anytime",
  },
  {
    verb: "lint",
    answers: "Do the structural checks pass?",
    model: "no model · CI gate, every push",
  },
  {
    verb: "test",
    answers: "Does the harness behave?",
    model: "no model · scripted stand-in · every commit",
  },
  {
    verb: "eval",
    answers: "Does a skill actually help?",
    model: "needs a model · your subscription · on demand",
  },
];

export function VerbMap() {
  return (
    <section id="how" className="scroll-mt-8 border-t border-border">
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <Badge className="mb-5">How it works</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            One tool. Four questions.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            <span className="font-mono text-foreground">audit</span> shows where
            your harness is still vibes. Turning that into verified is four
            commands over one engine — and almost none of it needs a model or a
            key.
          </p>
        </div>

        {/* The verb map — a table on desktop, stacked rows on mobile. Type +
            dividers, not four boxes. */}
        <div className="mx-auto mt-12 max-w-3xl divide-y divide-border border-y border-border">
          {VERBS.map((v) => (
            <div
              key={v.verb}
              className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[8rem_1fr_auto] sm:items-baseline sm:gap-4"
            >
              <code className="font-mono text-sm text-accent">
                $ vigiles {v.verb}
              </code>
              <span className="text-sm text-foreground">{v.answers}</span>
              <span className="text-xs text-muted-foreground sm:text-right">
                {v.model}
              </span>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">
            One engine, two doors.
          </span>{" "}
          <span className="font-mono text-foreground">audit</span> is the local
          report; <span className="font-mono text-foreground">lint</span> is the
          CI gate that fails the build on the same deterministic checks — broken
          references, tool contracts, dead hooks, skill collisions.
        </p>

        {/* Your rules → enforced — the prose-to-enforcement payoff of the hero
            pain. One compact card, not a new section. */}
        <Card className="reveal mx-auto mt-10 max-w-3xl p-6">
          <h3 className="text-base font-semibold tracking-tight">
            Your rules → enforced
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <span className="font-mono text-foreground">audit</span> maps each
            prose rule you wrote to the lint rule that enforces it — already on,
            one line away, or the one people screenshot:{" "}
            <span className="text-foreground">silently turned off.</span>{" "}
            Deterministic, no model.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md border border-signal/25 bg-signal/[0.06] px-3 py-2.5 font-mono text-xs leading-relaxed text-signal">
            {`"always use ===" → eqeqeq is "off" in your ESLint config
   your CLAUDE.md says enforce it; your config quietly turns it off`}
          </pre>
        </Card>
      </div>
    </section>
  );
}
