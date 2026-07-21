import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const FULL_FAQ = "https://github.com/zernie/vigiles/blob/main/docs/faq.md";

/** The objections a skeptical dev raises first — answered plainly. `a` is a node
 *  so we can bold the key phrase without dangerouslySetInnerHTML. */
const QA: { q: string; a: ReactNode }[] = [
  {
    q: "Do I have to write TypeScript?",
    a: (
      <>
        No — plain markdown works with zero new files, and rules run in your own
        linter config. The typed spec is opt-in, only for the structural checks
        a linter can&apos;t do — like TypeScript&apos;s{" "}
        <span className="font-mono">strict</span>.
      </>
    ),
  },
  {
    q: "Is it stable enough to adopt?",
    a: (
      <>
        The CLI you run is small and rarely changes. The high version number is
        release automation — a new major per breaking change — not age.
      </>
    ),
  },
  {
    q: "Non-JS repo?",
    a: (
      <>
        <span className="font-mono">npx vigiles lint</span> verifies your
        CLAUDE.md or AGENTS.md with no install — Ruff, Clippy, Pylint too.
      </>
    ),
  },
];

export function FAQ() {
  return (
    <section id="faq" className="scroll-mt-8 border-t border-border">
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <Badge className="mb-5">FAQ</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Questions people ask first.
          </h2>
        </div>

        <dl className="mx-auto mt-12 max-w-2xl divide-y divide-border border-t border-border">
          {QA.map((item) => (
            <div key={item.q} className="py-6">
              <dt className="text-base font-semibold tracking-tight text-foreground">
                {item.q}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 text-center">
          <a
            href={FULL_FAQ}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-base font-semibold text-accent no-underline transition-colors hover:text-accent/80"
          >
            Full FAQ
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
