import { ArrowLeft } from "lucide-react";
import { checkBySlug, ruleDocUrl, type CheckDoc } from "./checks";

/**
 * One audit-check explainer page — the "React-errors-have-a-page" shape: a stable,
 * shareable, indexable URL (`/checks/<slug>/`) per check. Rendered as a static Vite
 * MPA entry (see site/scripts/gen-check-pages.ts), so each page is real HTML with its
 * own <title>/OG for SEO — no client router, no SSR, no backend. Reuses the site's
 * Tailwind theme so it reads as one aesthetic.
 *
 * Links use `../../`-relative hrefs (this page lives two levels deep) so they stay
 * correct under Vite's `base: "./"` — the same relative-base contract the landing
 * uses, whether served at the vigiles.sh apex or a github.io subpath.
 */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3 text-base leading-relaxed text-foreground">
        {children}
      </div>
    </section>
  );
}

/** A before/after example — the bad tool line vs the fixed one, terminal-styled. */
function Example({ example }: { example: NonNullable<CheckDoc["example"]> }) {
  return (
    <div className="space-y-2">
      {example.bad !== undefined && (
        <pre className="overflow-x-auto rounded-lg border border-l-4 border-bad/40 border-l-bad bg-card/50 p-3 font-mono text-sm text-muted-foreground">
          {example.bad}
        </pre>
      )}
      {example.good !== undefined && (
        <pre className="overflow-x-auto rounded-lg border border-l-4 border-good/40 border-l-good bg-card/50 p-3 font-mono text-sm text-foreground">
          {example.good}
        </pre>
      )}
    </div>
  );
}

export function CheckPage({ slug }: { slug: string }) {
  const check = checkBySlug(slug);

  if (!check) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-24">
        <p className="text-muted-foreground">
          Unknown check:{" "}
          <span className="font-mono text-foreground">{slug}</span>.
        </p>
        <a
          href="../../"
          className="mt-6 inline-block text-accent hover:underline"
        >
          ← Back to vigiles.sh
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
      <a
        href="../../#try"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        vigiles checks
      </a>

      <div className="mt-8">
        <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-xs text-accent">
          {check.category}
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          {check.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          {check.gist}
        </p>
      </div>

      <Section title="What it means">
        <div className="space-y-3">
          {check.what.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </Section>

      <Section title="Why it matters">{check.why}</Section>

      {check.example && (
        <Section title="Example">
          <Example example={check.example} />
        </Section>
      )}

      <Section title="How to fix it">{check.fix}</Section>

      <div className="mt-12 border-t border-border pt-8">
        <p className="text-base text-foreground">
          Grade your own harness against this check and every other:
        </p>
        <code className="mt-3 inline-block rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground">
          $ npx vigiles audit
        </code>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <a href="../../" className="text-accent no-underline hover:underline">
            ← Back to vigiles.sh
          </a>
          <a
            href={ruleDocUrl(check.slug)}
            className="text-muted-foreground no-underline hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Full rule reference ↗
          </a>
        </div>
      </div>
    </main>
  );
}
