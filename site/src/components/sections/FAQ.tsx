import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const FULL_FAQ = "https://github.com/zernie/vigiles/blob/main/docs/faq.md";

/** The objections a skeptical dev raises first — answered plainly. `a` is a node
 *  so we can bold the key phrase without dangerouslySetInnerHTML. */
const QA: { q: string; a: ReactNode }[] = [
  {
    q: "Isn't this just another linter?",
    a: (
      <>
        It includes one — but the checks are about{" "}
        <span className="font-semibold text-foreground">truth</span>, not style:
        every rule, file, and tool your instructions name has to actually exist
        and be enabled (checked against your real ESLint / Ruff / Clippy
        config). And the test half <em>runs</em> your harness against a model to
        prove hooks block and skills fire — which no linter does.
      </>
    ),
  },
  {
    q: "What do I have to change to adopt it?",
    a: (
      <>
        Nothing up front. <span className="font-mono">audit</span> and{" "}
        <span className="font-mono">lint</span> read the CLAUDE.md or AGENTS.md
        you already have, as-is — nothing is moved or rewritten. When you like
        what you see, <span className="font-mono">npx vigiles init</span> adds
        the CI gate and installs the skills, so your agent handles the upkeep.
      </>
    ),
  },
  {
    q: "Does it only work with Claude Code?",
    a: (
      <>
        No — Claude Code and Codex are both first-class, and the checks read
        whichever one your repo targets. If your plugin is packaged to{" "}
        <a
          href="https://agent-plugins.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          Agent Plugins
        </a>{" "}
        — a packaging format, not another agent — its skills and root{" "}
        <span className="font-mono">mcp.json</span> are audited too.
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
