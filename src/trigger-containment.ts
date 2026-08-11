/**
 * Is a WEAKER model a valid lower bound for trigger-rate?
 *
 * THE QUESTION. `measureTriggerRate` floors at Sonnet, because a weaker model
 * under-selects: the same skill measured 0.50 on haiku and 0.90 on sonnet, so a
 * haiku number reads as "bad description" when the description is fine. The
 * standing counter-proposal is the ordinary worst-case argument — tune against
 * the weakest supported model and anything stronger is covered, the way you test
 * against the oldest supported runtime. It is a good argument, and it is valid
 * only if one thing is true:
 *
 *     CONTAINMENT:  fires on the weak model  =>  fires on the strong one
 *
 * If containment holds, the weak model is a genuine floor: cheaper, faster, and
 * it buys margin. If it does not, the weak model is not a floor at all — it is a
 * DIFFERENT router, and a prompt it fires on may be one the strong model
 * declines, so tuning against it optimises a configuration nobody runs.
 *
 * Nobody has measured it, which is why this is a function and not a footnote.
 * Selection is routing, not raw capability: a stronger model can legitimately
 * route ELSEWHERE — doing the work itself, or picking a more specific sibling —
 * so containment is genuinely open rather than obviously true.
 *
 * Pure: give it two reports (or anything carrying `perPrompt`) and it classifies
 * every prompt the two have in common.
 *
 * 🔴 HARNESS-AGNOSTIC BY CONSTRUCTION, BUT NOT EQUALLY TRUSTWORTHY EVERYWHERE.
 * This compares whatever two runs report, so it runs on Codex reports unchanged —
 * and should NOT be trusted there yet. Codex emits no skill-selection event, so
 * `fired` is INFERRED (from a `SKILL.md` read), and `measureTriggerRate` flags the
 * whole tier experimental for that reason. The inference error lands exactly where
 * this function looks: a prompt wrongly marked fired on one model and not the
 * other manufactures a `weakOnly` entry, i.e. a counterexample made of noise.
 * Read a containment verdict as strong as its weakest input signal — on Claude
 * Code, where firing is an observed event, that is a real comparison.
 */

/** The minimum a report must expose to be compared — structural, no import cycle. */
export interface ContainmentInput {
  /** Identifies the surface these prompts belong to (skill name, usually). */
  readonly subject: string;
  readonly perPrompt: readonly {
    readonly prompt: string;
    readonly rate: number;
  }[];
}

export interface ContainmentVerdict {
  /** Prompts present in BOTH inputs — the only ones a comparison can speak about. */
  readonly compared: number;
  /** Fired on both. */
  readonly both: readonly string[];
  /** Fired on neither. */
  readonly neither: readonly string[];
  /**
   * Fired on the WEAK model but not the strong one. Each is a counterexample to
   * "the weak model is a floor" — the whole point of the comparison.
   */
  readonly weakOnly: readonly string[];
  /**
   * Fired on the STRONG model but not the weak one. EXPECTED, and not a defect:
   * it is the weak model under-selecting, which is the known reason for the
   * model floor. Reported separately so the two are never conflated.
   */
  readonly strongOnly: readonly string[];
  /** `weakOnly.length === 0` — the weak model never fired where the strong did not. */
  readonly holds: boolean;
}

/**
 * Separator for the composite key, written as a code point so no control
 * character sits in this source. NUL rather than a printable character because a
 * prompt is a sentence and may contain any printable one — splitting on a space
 * cuts in the wrong place.
 */
const SEP = String.fromCharCode(0);

const index = (rows: readonly ContainmentInput[]): Map<string, boolean> => {
  const m = new Map<string, boolean>();
  for (const r of rows)
    for (const p of r.perPrompt)
      m.set(`${r.subject}${SEP}${p.prompt}`, p.rate > 0);
  return m;
};

/** Strip the composite key back to a readable `subject: prompt`. */
const readable = (k: string): string => {
  const at = k.indexOf(SEP);
  return at === -1 ? k : `${k.slice(0, at)}: ${k.slice(at + 1)}`;
};

/**
 * Classify every prompt the two runs share.
 *
 * ⚠️ At one trial per prompt every cell is a SINGLE observation, so one
 * `weakOnly` may be noise rather than a counterexample. Read a handful as
 * evidence and one as a reason to re-run at higher trials.
 */
export function compareContainment(
  weak: readonly ContainmentInput[],
  strong: readonly ContainmentInput[],
): ContainmentVerdict {
  const w = index(weak);
  const s = index(strong);
  const both: string[] = [];
  const neither: string[] = [];
  const weakOnly: string[] = [];
  const strongOnly: string[] = [];
  for (const [k, firedWeak] of w) {
    if (!s.has(k)) continue;
    const firedStrong = s.get(k) === true;
    if (firedWeak && firedStrong) both.push(readable(k));
    else if (!firedWeak && !firedStrong) neither.push(readable(k));
    else if (firedWeak) weakOnly.push(readable(k));
    else strongOnly.push(readable(k));
  }
  return {
    compared:
      both.length + neither.length + weakOnly.length + strongOnly.length,
    both,
    neither,
    weakOnly,
    strongOnly,
    holds: weakOnly.length === 0,
  };
}

/** Human-readable verdict — the counterexamples in full, since they are the result. */
export function formatContainment(v: ContainmentVerdict): string {
  if (v.compared === 0)
    return "no prompts in common — the two runs do not describe the same set.";
  const pct = (n: number) => `${((n / v.compared) * 100).toFixed(0)}%`;
  const lines = [
    `prompts compared: ${String(v.compared)}`,
    `  both        ${String(v.both.length).padStart(3)}  ${pct(v.both.length)}`,
    `  neither     ${String(v.neither.length).padStart(3)}  ${pct(v.neither.length)}`,
    `  weak only   ${String(v.weakOnly.length).padStart(3)}  ${pct(v.weakOnly.length)}`,
    `  strong only ${String(v.strongOnly.length).padStart(3)}  ${pct(v.strongOnly.length)}`,
    "",
    `CONTAINMENT (weak fires => strong fires): ${v.holds ? "HOLDS" : "DOES NOT HOLD"}`,
  ];
  if (!v.holds) {
    lines.push(
      "",
      `${String(v.weakOnly.length)} prompt(s) fired on the weak model but NOT the strong one —`,
      "each is a counterexample to treating the weak model as a floor:",
      ...v.weakOnly.map((k) => `  ${k}`),
    );
  }
  lines.push(
    "",
    `${String(v.strongOnly.length)} fired on the strong model only — expected (the weak model` +
      " under-selects), not a containment failure.",
  );
  return lines.join("\n");
}
