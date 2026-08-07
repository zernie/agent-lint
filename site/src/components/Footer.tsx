import { Github, BookText } from "lucide-react";

const REPO = "https://github.com/zernie/vigiles";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
          <div className="max-w-xl">
            <div className="flex items-center gap-2.5">
              <img
                src="./logo.png"
                alt=""
                className="h-7 w-7 rounded-md"
                width={28}
                height={28}
              />
              <span className="text-base font-semibold tracking-tight">
                vigiles
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              vigiles is free &amp; open source. It verifies the references in
              your agent instruction files — that each rule exists and is
              enabled, that paths and scripts are real, that your skills
              actually trigger.
            </p>
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-muted-foreground no-underline transition-colors hover:text-foreground"
            >
              <Github className="h-4 w-4" aria-hidden />
              github.com/zernie/vigiles
            </a>
            <a
              href={`${REPO}/blob/main/docs/README.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-muted-foreground no-underline transition-colors hover:text-foreground"
            >
              <BookText className="h-4 w-4" aria-hidden />
              Docs
            </a>
            <a
              href="./api/"
              className="inline-flex items-center gap-2 text-muted-foreground no-underline transition-colors hover:text-foreground"
            >
              <BookText className="h-4 w-4" aria-hidden />
              API reference
            </a>
          </div>
        </div>
        <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          MIT licensed. Ships as an{" "}
          <a
            href="https://agent-plugins.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Agent Plugins
          </a>{" "}
          1.0.0 plugin.
        </div>
      </div>
    </footer>
  );
}
