/** The five audit categories — the QUESTION each answers is the new info here;
 *  the sample scores already live in the hero, so they're not repeated. */
const CATEGORIES: { name: string; blurb: string }[] = [
  {
    name: "Truthfulness",
    blurb:
      "Do your references resolve? Every rule, path, and script — real and enabled.",
  },
  {
    name: "Triggering",
    blurb: "Do your skills actually fire — and not collide with each other?",
  },
  {
    name: "Structure",
    blurb: "Tool contracts, MCP servers, and frontmatter that hold together.",
  },
  {
    name: "Safety",
    blurb:
      "Could a prompt injection turn your own tools into an exfil path? Read from the tool-set alone.",
  },
  {
    name: "Tested",
    blurb: "Is any of it covered by a test or eval — or is it all on faith?",
  },
];

export function Rings() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          One score, five categories.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Deterministic and model-free — the same grade on every machine, no API
          key, no setup.
        </p>
      </div>

      <div className="mt-14 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => (
          <div key={c.name} className="reveal">
            <h3 className="text-base font-semibold tracking-tight">{c.name}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {c.blurb}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
