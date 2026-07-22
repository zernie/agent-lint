import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/** The four verbs over one engine — the "one tool, not four" frame. Each row is a
 *  clickable summary (command · what it answers · model note) that EXPANDS to a
 *  plain-English explanation + a concrete example, because a one-line label doesn't
 *  actually tell you what `lint` vs `test` vs `eval` do. */
const VERBS: {
  verb: string;
  answers: string;
  model: string;
  /** What the verb actually does, in plain words. */
  detail: string;
  /** A concrete one-liner of what it catches / proves. */
  example: string;
}[] = [
  {
    verb: "audit",
    answers: "Everything, graded A–F",
    model: "no model · read-only · anytime",
    detail:
      "The zero-config front door. One command reads your whole harness and grades it across five categories — truthful references, skills that trigger, sound structure, safety, test coverage. Nothing executes; it's a local report, like Lighthouse.",
    example:
      'CLAUDE.md says "always use ===" → eqeqeq is OFF in your ESLint config',
  },
  {
    verb: "lint",
    answers: "Do the structural checks pass?",
    model: "no model · CI gate, every push",
    detail:
      "The CI gate. The same deterministic checks as audit, but as a build step that FAILS the PR when something's broken — a subagent pointing at a tool that doesn't exist, a hook on a misspelled event, two skills that collide. No model, runs on every push.",
    example:
      "✗ subagent 'reviewer' lists tool AskUserQuestion — never available → build fails",
  },
  {
    verb: "test",
    answers: "Does the harness behave?",
    model: "no model · scripted stand-in · every commit",
    detail:
      "Runs your actual hooks and skills against a scripted stand-in model — deterministic, no API key. Proves a safety hook really blocks a dangerous command, or that a skill wires into the assembled machine and fires. The cheap middle tier: real harness, fake model.",
    example:
      "assert the pre-push hook blocks `git push --force` → it does (exit 2) ✓",
  },
  {
    verb: "eval",
    answers: "Does a skill actually help?",
    model: "needs a model · your subscription · on demand",
    detail:
      "The one tier that needs a real model — run on YOUR Claude subscription, not a metered API. Measures whether a skill's description makes it FIRE when it should (recall) and stay quiet otherwise (precision), and whether its guidance moves the agent's behavior at all.",
    example:
      "commit-helper: fires 9/10 relevant · 0/10 unrelated → recall 90% · precision 100%",
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
            key. <span className="text-foreground">Tap any command</span> to see
            what it does.
          </p>
        </div>

        {/* The verb map — each row is a <details>: the summary is the scannable
            command/answer/model line; expanding reveals the plain-English detail +
            a concrete example. Type + dividers, not four boxes. */}
        <div className="mx-auto mt-12 max-w-3xl divide-y divide-border border-y border-border">
          {VERBS.map((v) => (
            <details key={v.verb} className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-4 sm:grid-cols-[10.5rem_1fr_auto]">
                <code className="flex items-center gap-1.5 whitespace-nowrap font-mono text-sm text-accent">
                  <ChevronRight
                    size={13}
                    className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                  $ vigiles {v.verb}
                </code>
                <span className="col-start-1 pl-[1.375rem] text-sm text-foreground sm:col-start-2 sm:pl-0">
                  {v.answers}
                </span>
                <span className="col-start-2 row-start-1 text-xs text-muted-foreground sm:col-start-3 sm:text-right">
                  {v.model}
                </span>
              </summary>
              {/* Expanded explanation — the part the old one-liner never told you.
                  Left pad matches the command column so it lines up under the answer. */}
              <div className="pb-5 pl-[1.375rem] pr-1 sm:pl-[10.5rem]">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {v.detail}
                </p>
                <pre className="mt-3 whitespace-pre-wrap break-words rounded-md border border-border bg-card/50 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
                  {v.example}
                </pre>
              </div>
            </details>
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
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight">
              Your rules → enforced
            </h3>
            {/* Clearly an ILLUSTRATION, not a scan of your repo — the example
                below is representative, not a fabricated result (credibility). */}
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              example
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <span className="font-mono text-foreground">audit</span> maps each
            prose rule you wrote to the lint rule that enforces it, and tells
            you which state it&apos;s in: already on, one line from on, or — the
            costly one —{" "}
            <span className="text-foreground">
              silently turned off in your own config.
            </span>{" "}
            Deterministic, no model.
          </p>
          <pre className="mt-4 whitespace-pre-wrap break-words rounded-md border border-signal/25 bg-signal/[0.06] px-3 py-2.5 font-mono text-xs leading-relaxed text-signal">
            {`"always use ===" → eqeqeq is "off" in your ESLint config
   your CLAUDE.md says enforce it; your config quietly turns it off`}
          </pre>
        </Card>
      </div>
    </section>
  );
}
