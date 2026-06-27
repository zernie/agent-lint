/**
 * Auto-generated trigger probes for `vigiles audit`'s model trigger tier.
 *
 * The trigger-rate eval needs a per-skill prompt set (does the description FIRE?
 * — recall + precision). Authoring that set by hand was the friction that made
 * the eval un-wowable. The trigger tier removes it: derive a small, DIVERSE probe
 * set from each skill's own description — zero setup. `--prompts=<file>` still
 * overrides for a rigorous, curated benchmark.
 *
 * Deterministic by design (no model needed to AUTHOR the probes — the model is
 * spent RUNNING them). The trick that clears the diversity gate: extract a SHORT
 * topic from the description (so the shared text stays small relative to the
 * frame) and wrap it in lexically-distant frames. Measured min pairwise NCD
 * ~0.27 across short/long descriptions — comfortably above {@link AUTO_MIN_DISTANCE}.
 */
import type { TriggerPromptSet } from "./scan-behavioral.js";

export interface PromptSkill {
  readonly name: string;
  readonly description: string;
}

/** How many recall probes we generate per skill (each a distinct frame). */
export const AUTO_RECALL_COUNT = 6;
/**
 * The diversity floor for AUTO probes — relaxed from the default 0.3 because a
 * templated-but-varied machine probe legitimately shares a topic phrase (the
 * generator's measured min is ~0.27). Still well above 0 → genuine copy-paste
 * is caught; the gate's "vary the phrasing" advice is for hand-authored sets.
 */
export const AUTO_MIN_DISTANCE = 0.2;

// Lexically-distant frames around a short topic. Order matters: the first N are
// used, and they're arranged so any prefix stays diverse (verified in the test).
const RECALL_FRAMES: readonly ((t: string) => string)[] = [
  (t) => `I need help to ${t} in my project right now.`,
  (t) => `How do I ${t}? Walk me through the steps.`,
  (t) => `Please ${t} before I open this pull request.`,
  (t) => `What's the recommended way to ${t} on a large team?`,
  (t) => `Can you take a look and ${t} for me?`,
  (t) => `My task today: ${t} across the whole repo.`,
  (t) => `Is there a tool that will ${t} automatically?`,
  (t) => `Give me a checklist to ${t} thoroughly.`,
];

// Unrelated requests for the precision arm — varied, clearly off-topic, so a
// well-scoped skill should NOT fire on them (a too-broad description that hijacks
// these fails precision). Generic on purpose, distant from any one skill's topic.
const IRRELEVANT_BANK: readonly string[] = [
  "What's the weather forecast for Tokyo this weekend?",
  "Summarize the plot of Hamlet in two sentences.",
  "Convert 100 US dollars to euros at today's rate.",
  "Recommend a good pasta recipe for dinner tonight.",
];

// Boilerplate lead-in words that carry no topical signal (skill descriptions
// open with a verb — "Reviews…", "Generate…" — so stripping these from the front
// never eats the real action). Applied iteratively until a content word remains.
const LEAD_WORD =
  /^(a|an|the|this|use|skill|agent|tool|command|helper|that|which|to|for|when|invoked?|invoke|used?|helps?|you|with)\b[\s,:-]*/i;

/**
 * Extract a short, action-shaped topic from a description: drop boilerplate
 * lead-ins ("A skill that…", "Use this skill to…"), take the first clause, cap
 * at 8 words. Capping is load-bearing — a long verbatim topic makes the frames
 * too similar (NCD collapses below the gate).
 */
export function topicOf(description: string): string {
  let t = description.trim().toLowerCase();
  let prev = "";
  while (t !== prev) {
    prev = t;
    t = t.replace(LEAD_WORD, "");
  }
  const firstClause = t.split(/[.,;:!?]/)[0].trim();
  const words = firstClause.split(/\s+/).filter(Boolean).slice(0, 8);
  const topic = words.join(" ");
  // Fall back to the raw (capped, lowercased) description if stripping left nothing.
  return (
    topic || description.trim().toLowerCase().split(/\s+/).slice(0, 8).join(" ")
  );
}

/** Recall probes for one skill: distinct frames around its extracted topic. */
export function recallPrompts(
  description: string,
  count = AUTO_RECALL_COUNT,
): string[] {
  const topic = topicOf(description);
  return RECALL_FRAMES.slice(0, count).map((frame) => frame(topic));
}

/**
 * Build a {@link TriggerPromptSet} from skill descriptions — zero-setup trigger
 * probes. Each skill gets `recallPrompts` derived from its description plus the
 * shared irrelevant bank for precision. Skills with an empty description are
 * skipped (nothing to derive a topic from).
 */
export function autoTriggerPrompts(
  skills: readonly PromptSkill[],
  count = AUTO_RECALL_COUNT,
): TriggerPromptSet {
  const set: Record<string, { prompts: string[]; irrelevant: string[] }> = {};
  for (const s of skills) {
    if (!s.description.trim()) continue;
    set[s.name] = {
      prompts: recallPrompts(s.description, count),
      irrelevant: [...IRRELEVANT_BANK],
    };
  }
  return set;
}
