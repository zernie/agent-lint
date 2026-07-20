import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandBlock } from "@/components/CommandBlock";

const REPO = "https://github.com/zernie/vigiles";

export function CTA() {
  return (
    <section className="border-t border-border bg-card/30">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-20 text-center sm:py-28">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Grade your harness in one command.
        </h2>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Point it at any repo. It reads, reports, and never touches your world.
        </p>
        <div className="mt-9">
          <CommandBlock command="npx vigiles audit" />
        </div>
        <div className="mt-8">
          <Button href={REPO} size="lg" variant="primary">
            <Github className="h-4 w-4" aria-hidden />
            View on GitHub
          </Button>
        </div>
      </div>
    </section>
  );
}
