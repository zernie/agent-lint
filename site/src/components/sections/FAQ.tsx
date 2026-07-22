import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const FULL_FAQ = "https://github.com/zernie/vigiles/blob/main/docs/faq.md";

/** The objections a skeptical dev raises first — answered plainly. `a` is a node
 *  so we can bold the key phrase without dangerouslySetInnerHTML. */
const QA: { q: string; a: ReactNode }[] = [
  {
    q: "How is this different from a linter?",
    a: (
      <>
        A linter checks your config is <em>well-formed</em>. vigiles checks
        it&apos;s <span className="font-semibold text-foreground">true</span> —
        that every rule, file, and tool your instructions name actually exists
        and is enabled. Valid and correct are different failures.
      </>
    ),
  },
  {
    q: "What do I have to change to adopt it?",
    a: (
      <>
        Almost nothing. Plain markdown works with zero new files, rules run in
        your existing linter, and the agent edits the specs for you.{" "}
        <span className="font-mono">npx vigiles init</span> wires it up; typed
        specs are opt-in, only for checks a linter can&apos;t express.
      </>
    ),
  },
  {
    q: "Can I grade a private repo?",
    a: (
      <>
        Yes — run <span className="font-mono">npx vigiles audit</span> in it
        locally. It reads your working copy off disk, so private repos work with{" "}
        <span className="text-foreground">
          no upload, no account, no server
        </span>{" "}
        — nothing leaves your machine. Only the browser demo above is
        public-only (it calls GitHub&apos;s API to read a repo you name).
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
