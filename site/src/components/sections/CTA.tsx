import { Github } from "lucide-react";
import { CommandBlock } from "@/components/CommandBlock";

const REPO = "https://github.com/zernie/vigiles";

export function CTA() {
  return (
    <section className="border-t border-border bg-card/30">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-20 text-center sm:py-28">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Grade your harness in one command.
        </h2>
        <div className="mt-8">
          <CommandBlock command="npx vigiles audit" />
        </div>
        <a
          href={REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          <Github className="h-4 w-4" aria-hidden />
          View the source on GitHub
        </a>
      </div>
    </section>
  );
}
