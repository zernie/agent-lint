import { cn } from "@/lib/utils";

type Band = "good" | "warn" | "bad" | "na";

const STROKE: Record<Band, string> = {
  good: "stroke-good",
  warn: "stroke-warn",
  bad: "stroke-bad",
  na: "stroke-na",
};
const FILL: Record<Band, string> = {
  good: "fill-good",
  warn: "fill-warn",
  bad: "fill-bad",
  na: "fill-na",
};

/** A circular score gauge (the Lighthouse ring) as inline SVG, styled via Tailwind. */
export function Ring({
  score,
  band,
  size = 72,
  stroke = 6,
}: {
  score: number;
  band: Band;
  size?: number;
  stroke?: number;
}) {
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-border"
      />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${pct * circ} ${circ}`}
        transform={`rotate(-90 ${c} ${c})`}
        className={STROKE[band]}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.round(size * 0.3)}
        className={cn("font-extrabold", FILL[band])}
      >
        {score}
      </text>
    </svg>
  );
}
