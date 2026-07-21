import { band, STROKE, FILL } from "../lib/band";
import { cn } from "../lib/utils";

/** A circular score gauge (the Lighthouse ring) as inline SVG — styled via Tailwind. */
export function Ring({
  score,
  size = 80,
  stroke = 7,
  advisory = false,
}: {
  score: number | null;
  size?: number;
  stroke?: number;
  /** Advisory categories don't gate the grade — render neutral (na), never red. */
  advisory?: boolean;
}) {
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  // An advisory ring is informational, not a pass/fail — show it in the neutral
  // band so it never reads as a failing/red ring dragging the overall.
  const b = advisory ? "na" : band(score);
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
        className={STROKE[b]}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.round(size * 0.28)}
        className={cn("font-extrabold", FILL[b])}
      >
        {score === null ? "n/a" : score}
      </text>
    </svg>
  );
}
