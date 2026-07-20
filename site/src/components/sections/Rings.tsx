import { Card } from "@/components/ui/card";
import { Ring } from "@/components/Ring";

type Band = "good" | "warn" | "bad";

const RINGS: {
  name: string;
  score: number;
  band: Band;
  blurb: string;
}[] = [
  {
    name: "Truthfulness",
    score: 100,
    band: "good",
    blurb:
      "Do your references resolve? Every rule, path, and script — real and enabled.",
  },
  {
    name: "Triggering",
    score: 92,
    band: "good",
    blurb: "Do your skills actually fire — and not collide with each other?",
  },
  {
    name: "Structure",
    score: 92,
    band: "good",
    blurb: "Tool contracts, MCP servers, and frontmatter that hold together.",
  },
  {
    name: "Safety",
    score: 80,
    band: "warn",
    blurb:
      "Could a prompt injection turn your own tools into an exfil path? Read from the tool-set alone.",
  },
  {
    name: "Tested",
    score: 88,
    band: "warn",
    blurb: "Is any of it covered by a test or eval — or is it all on faith?",
  },
];

export function Rings() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Five rings. One score.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          One command, five deterministic categories, weighted A–F — plus every
          finding&apos;s fix, inline.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {RINGS.map((ring) => (
          <Card
            key={ring.name}
            className="reveal flex flex-col items-center p-7 text-center"
          >
            <Ring score={ring.score} band={ring.band} />
            <h3 className="mt-5 text-lg font-semibold tracking-tight">
              {ring.name}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {ring.blurb}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
