import { AlertTriangle } from "lucide-react";
import { BUILTIN_LINTERS } from "@engine/spec";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FAILURES: {
  title: string;
  code: string;
  problem: string;
}[] = [
  {
    title: "A hook on a made-up event",
    code: 'event: "Setup"',
    problem:
      "There's no Setup event, so the hook never fires. The config is valid YAML — it just does nothing.",
  },
  {
    title: "A silently-dropped tool",
    code: "tools: [Read, AskUserQuestion]",
    problem:
      "AskUserQuestion isn't a real subagent tool. The harness drops it without a word — your agent quietly can't ask.",
  },
  {
    title: "A hook script that isn't there",
    code: "${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh",
    problem:
      "The path parses fine. The file was never committed, so the guard you think protects you runs nothing.",
  },
  {
    title: "A skill pointing at a ghost",
    code: "See references/schema.md",
    problem:
      "The skill references a file that doesn't exist on disk. The model follows a link into nowhere.",
  },
];

/** Display casing for the linters (the engine's `BUILTIN_LINTERS` is lowercase).
 * A linter with no entry renders under its own lowercase name (detekt / ktlint /
 * golangci-lint — their canonical branding), so the fallback is always correct. */
const LINTER_LABELS: Record<string, string> = {
  eslint: "ESLint",
  stylelint: "Stylelint",
  ruff: "Ruff",
  clippy: "Clippy",
  pylint: "Pylint",
  rubocop: "RuboCop",
  cedar: "Cedar",
  checkstyle: "Checkstyle",
};

/** The linters vigiles cross-references a rule against — DERIVED from the
 * engine's `BUILTIN_LINTERS` so the strip can never drift from what's shipped
 * (add a linter there and it appears here automatically). */
const LINTERS = BUILTIN_LINTERS.map((l) => LINTER_LABELS[l] ?? l);

export function Wedge() {
  return (
    <section
      id="wedge"
      className="scroll-mt-8 border-y border-border bg-card/30"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="signal" className="mb-5">
            The problem
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Valid config. Broken agent.
          </h2>
          {/* This read "Every other tool checks your config is well-formed" until
              2026-09-07 — a universal that is simply false: `claude plugin validate`
              flags a subagent with no description and a manifest whose hook block
              cannot load, and `checks.ts` already says out loud that vigiles MATCHES
              it on the frontmatter check. So the lede names the overlap instead of
              denying it, and claims nothing exclusive about the four cards below;
              the one exclusive claim on this page is the linter cross-reference in
              the resolution, which is where it belongs. */}
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Config validators — Anthropic&apos;s own{" "}
            <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-base">
              claude plugin validate
            </code>{" "}
            included — catch a malformed manifest or a subagent missing its
            description, and vigiles agrees with them there. The failures that
            bite hardest are the ones that parse perfectly and point at nothing:
            a hook on an event that doesn&apos;t exist, a tool the harness
            silently drops, a script that was never committed.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {FAILURES.map((f) => (
            <Card key={f.title} className="reveal p-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal/10 text-signal">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold tracking-tight">
                    {f.title}
                  </h3>
                  <code className="mt-2 inline-block max-w-full overflow-x-auto rounded-md border border-signal/25 bg-signal/[0.06] px-2.5 py-1 font-mono text-sm text-signal">
                    {f.code}
                  </code>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {f.problem}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* The resolution — one line (the six categories are shown live in
            the report above, so we don't re-list them here), then the linter strip
            as Truthfulness's deepest detail. */}
        <div className="mt-16 border-t border-border pt-12">
          <p className="mx-auto max-w-2xl text-center text-lg leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              vigiles grades all of it
            </span>{" "}
            — one deterministic, model-free score across six categories (see the
            report above). The deepest check, and the one no other tool does:
            every rule your instructions name is resolved against your real
            linter — eleven of them, from JS to Rust to Go to Kotlin. The rule
            has to <span className="text-foreground">exist</span>, and wherever
            that linter has an on/off switch, be{" "}
            <span className="text-foreground">enabled</span> in your config:
          </p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {LINTERS.map((name) => (
              <li
                key={name}
                className="rounded-md bg-muted/50 px-2.5 py-1 font-mono text-xs text-muted-foreground"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
