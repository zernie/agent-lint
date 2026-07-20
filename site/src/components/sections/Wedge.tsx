import { AlertTriangle } from "lucide-react";
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

export function Wedge() {
  return (
    <section
      id="wedge"
      className="scroll-mt-8 border-y border-border bg-card/30"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="signal" className="mb-5">
            The wedge
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            &ldquo;Valid&rdquo; is not &ldquo;true.&rdquo;
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Every other tool checks whether your config is well-formed.
            That&apos;s the wrong question — the failures that bite are
            references that parse perfectly and don&apos;t resolve.
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

        <p className="mx-auto mt-12 max-w-2xl text-center text-base text-muted-foreground">
          vigiles resolves rule references across{" "}
          <span className="text-foreground">7 linter catalogs</span>, checks
          that paths and scripts are real, and measures whether your skills
          actually trigger. Nobody else does this.
        </p>
      </div>
    </section>
  );
}
