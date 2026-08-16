import { ArrowUpRight, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** The docs are plain markdown in the repo — there is no separate docs site, so
 *  every link here points at GitHub's rendered blob. Deliberately NOT the whole
 *  index (31 files): a list of everything is as useless to a first-time reader as
 *  no list at all. These six are the entry points — the ones the README leans on
 *  most, one per thing the landing page has already promised (grade it, run it,
 *  measure it, set it up). "Browse all docs" below carries the rest. */
const DOCS = "https://github.com/zernie/vigiles/blob/main/docs";

const LINKS: { title: string; file: string; blurb: string }[] = [
  {
    title: "What it catches",
    file: "what-vigiles-catches.md",
    blurb:
      "The full list of harness problems, biggest first — and which of them a typed spec makes impossible to write in the first place.",
  },
  {
    title: "Which command to run",
    file: "commands-and-how-they-relate.md",
    blurb:
      "The map behind the four verbs above: when to reach for audit, lint, test or eval, and why measuring skills starts with init.",
  },
  {
    title: "Verify your instructions",
    file: "verifying-instruction-files.md",
    blurb:
      "The lint layer end to end — how every file, script, symbol and rule your CLAUDE.md names gets checked against your real config.",
  },
  {
    title: "Test hooks and skills",
    file: "harness-testing.md",
    blurb:
      "Pick what you want to prove — a hook really blocks, a skill really fires — and copy the first test for it. No API key.",
  },
  {
    title: "Measure whether it helps",
    file: "measuring-skills.md",
    blurb:
      "A/B a skill, plugin, rule or model change on real coding tasks and get the number, on your own subscription instead of a metered API.",
  },
  {
    title: "Set it up in your repo",
    file: "agent-setup.md",
    blurb:
      "What npx vigiles init writes, the per-agent recipes (Claude Code, Codex, Cursor), and wiring the CI gate.",
  },
];

export function Docs() {
  return (
    <section id="docs" className="scroll-mt-8 border-t border-border">
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <Badge className="mb-5">Docs</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            The rest is written down.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            The documentation is markdown in the repo — one source of truth, no
            second site to drift out of sync. Start with the line that matches
            what you&apos;re trying to do.
          </p>
        </div>

        {/* Type + dividers, same as the verb map — a link list, not six cards. */}
        <div className="mx-auto mt-12 max-w-3xl divide-y divide-border border-y border-border">
          {LINKS.map((d) => (
            <a
              key={d.file}
              href={`${DOCS}/${d.file}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group grid gap-1 py-4 no-underline sm:grid-cols-[13rem_1fr] sm:gap-x-6"
            >
              {/* The arrow rides the last word (inline, not a flex sibling) so a
                  title that wraps at a narrow width doesn't strand it mid-block. */}
              <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-accent">
                {d.title}
                <ArrowUpRight
                  className="ml-1 inline-block h-3.5 w-3.5 align-[-0.1em] text-muted-foreground transition-colors group-hover:text-accent"
                  aria-hidden
                />
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {d.blurb}
              </span>
            </a>
          ))}
        </div>

        <div className="mt-10 text-center">
          <a
            href={`${DOCS}/README.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-base font-semibold text-accent no-underline transition-colors hover:text-accent/80"
          >
            Browse all docs
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
