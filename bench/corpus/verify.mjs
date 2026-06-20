/**
 * Self-check for the corpus correctness oracles — runnable, no model.
 *
 * The benchmark's blast-radius column is only trustworthy if each task's `check`
 * actually DISCRIMINATES: returns 1 on a known-good artifact and 0 on a known-bad
 * one. A `check` that always returns 1 (or always 0) would silently void the
 * correctness gate. This proves every predicate splits a good/bad fixture.
 *
 * bench/ is outside the vitest `src/**` sweep (like the evals themselves), so this
 * is the corpus's guard: run it directly.
 *
 *   node bench/corpus/verify.mjs        # exits 0 all-pass, 1 on any failure
 */
import assert from "node:assert/strict";
import { CODING_TASKS, corpusTask } from "./coding-tasks.mjs";

/** Build a CheckCtx from a flat {filename: contents} map. */
const ctxOf = (files) => ({ file: (name) => files[name] });

// Per-task good/bad fixtures: the artifact a correct run writes vs a plausible
// wrong one (empty, or the seeded bug left in place).
const FIXTURES = {
  slugify: {
    good: {
      "slug.js":
        "function slugify(s){return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}",
    },
    bad: { "slug.js": "// TODO" },
  },
  debounce: {
    good: {
      "debounce.js":
        "function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}",
    },
    bad: { "debounce.js": "const debounce = fn => fn;" },
  },
  "bugfix-offbyone": {
    good: {
      "fixed.js":
        "function lastN(arr,n){const out=[];for(let i=arr.length-n;i<arr.length;i++)out.push(arr[i]);return out;}",
    },
    // the original off-by-one bug, uncorrected
    bad: {
      "fixed.js":
        "function lastN(arr,n){const out=[];for(let i=arr.length-n-1;i<arr.length;i++)out.push(arr[i]);return out;}",
    },
  },
  bigO: {
    good: { "ans.txt": "Nested loops over n.\nANSWER: O(n^2)" },
    bad: { "ans.txt": "Linear scan.\nANSWER: O(n)" },
  },
  "regex-email": {
    good: {
      "email.js":
        "function isEmail(s){return /^[^@]+@[^@]+\\.[^@]+$/.test(s);}",
    },
    bad: { "email.js": "function isEmail(s){return s.length > 0;}" },
  },
};

let failures = 0;
for (const t of CODING_TASKS) {
  const fx = FIXTURES[t.name];
  assert.ok(fx, `no fixture for corpus task '${t.name}'`);
  // Shape: every task carries the fields a benchmark/optimizer reads.
  assert.equal(typeof t.task, "string", `${t.name}: task prompt`);
  assert.equal(typeof t.files, "object", `${t.name}: seed files`);
  assert.equal(typeof t.check, "function", `${t.name}: check`);
  assert.equal(corpusTask(t.name), t, `${t.name}: lookup by name`);

  const good = t.check(ctxOf(fx.good));
  const bad = t.check(ctxOf(fx.bad));
  const ok = good === 1 && bad === 0;
  if (!ok) {
    failures++;
    console.error(
      `✗ ${t.name}: check(good)=${good} (want 1), check(bad)=${bad} (want 0)`,
    );
  } else {
    console.log(`✓ ${t.name}: discriminates (good→1, bad→0)`);
  }
}

assert.equal(corpusTask("nope"), undefined, "unknown task → undefined");

if (failures > 0) {
  console.error(`\n${failures} corpus check(s) do not discriminate`);
  process.exit(1);
}
console.log(`\nAll ${CODING_TASKS.length} corpus tasks discriminate good/bad.`);
