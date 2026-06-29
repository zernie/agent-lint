/**
 * HEADROOM corpus — harder tasks where the baseline FAILS, so a "make-it-better"
 * skill (planning / edge-case-first / TDD) has something to LIFT.
 *
 * The neutral `coding-tasks.mjs` corpus is compression-calibrated: a capable model
 * aces correctness (1.0/1.0), so there is no headroom to measure a correctness
 * improvement — only token deltas. To benchmark the BIG non-compression claims
 * ("makes the agent smarter / fewer bugs") you need tasks the baseline gets WRONG.
 *
 * Each task here:
 *   - asks for a function written to `sol.js` exporting a named entry;
 *   - has an EXECUTING check — it runs the written function against EDGE-CASE test
 *     cases via `ctx.sh` (real correctness, not a regex), returning 1 iff ALL pass;
 *   - is calibrated to be HARD enough that a weak model misses an edge (touching
 *     intervals, subtractive roman notation), so a planning skill can show lift.
 *
 * The harness JS is passed to node via base64 to avoid shell-quoting hell. Run
 * `node bench/corpus/verify-headroom.mjs` to prove each check discriminates a
 * known-good vs known-bad solution (no model).
 */

/** @typedef {{ file:(n:string)=>string|undefined, sh:(c:string)=>string }} CheckCtx */

/** Run a node harness (reads ./sol.js, prints "ok/total") in the run cwd → {ok,total}. */
export function runHarness(ctx, harnessJs) {
  const b64 = Buffer.from(harnessJs).toString("base64");
  const out = ctx.sh(`node -e "$(printf %s '${b64}' | base64 -d)"`) || "";
  const m = /(\d+)\s*\/\s*(\d+)/.exec(out);
  return m ? { ok: Number(m[1]), total: Number(m[2]) } : { ok: 0, total: 0 };
}

/** Shared preamble: resolve the exported function however the agent exported it. */
const RESOLVE = (name) =>
  `const m=require('./sol.js');const f=(m&&m.${name})||(m&&m.default)||(typeof m==='function'?m:null);` +
  `const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);let ok=0;`;

/** @type {{name:string,files:Record<string,string>,task:string,check:(ctx:CheckCtx)=>0|1}[]} */
export const HEADROOM_TASKS = [
  {
    name: "merge-intervals",
    files: {
      "in.txt":
        "Merge overlapping intervals — a classic that trips on edge cases.",
    },
    task:
      "Read in.txt. Write `mergeIntervals(intervals)` to sol.js and export it with " +
      "`module.exports = { mergeIntervals }`. It takes an array of [start,end] pairs " +
      "and returns the merged, sorted, non-overlapping intervals. Handle ALL edge " +
      "cases: unsorted input, TOUCHING intervals ([1,2] and [2,3] merge to [1,3]), and " +
      "fully nested intervals. Then briefly explain your approach. Stop.",
    check: (ctx) => {
      const { ok, total } = runHarness(
        ctx,
        RESOLVE("mergeIntervals") +
          "const T=[" +
          "[[[1,3],[2,6],[8,10],[15,18]],[[1,6],[8,10],[15,18]]]," + // overlap
          "[[[1,2],[2,3]],[[1,3]]]," + // touching
          "[[[5,6],[1,3]],[[1,3],[5,6]]]," + // unsorted
          "[[[1,4],[2,3]],[[1,4]]]" + // nested
          "];for(const e of T){let r;try{r=f(JSON.parse(JSON.stringify(e[0])))}catch(_){r=null}if(eq(r,e[1]))ok++;}" +
          "console.log(ok+'/'+T.length);",
      );
      return ok === total && total > 0 ? 1 : 0;
    },
  },
  {
    // A MULTI-REQUIREMENT spec (not a textbook algorithm models have memorized):
    // the "obvious" split-on-&-then-= parser silently drops 3 of the 6 rules
    // (array-on-repeat, bare-key→'', empty-pair-ignored), so the baseline tends to
    // miss an edge → real headroom for a planning/edge-case-first skill.
    name: "parse-query",
    files: {
      "in.txt":
        "Parse a URL query string — the edges are in the spec, not the algorithm.",
    },
    task:
      "Read in.txt. Write `parseQuery(qs)` to sol.js and export it with " +
      "`module.exports = { parseQuery }`. Parse a URL query string into an object. " +
      "Handle ALL six rules: (1) strip a leading '?'; (2) '+' decodes to a space; " +
      "(3) %XX percent-encoding is decoded; (4) a key appearing MORE THAN ONCE " +
      "collects its values into an ARRAY in order; (5) a key with no '=' gets value " +
      "'' (empty string); (6) empty pairs (from '&&') are IGNORED. Then briefly " +
      "explain. Stop.",
    check: (ctx) => {
      const { ok, total } = runHarness(
        ctx,
        RESOLVE("parseQuery") +
          "const so=(o)=>o&&typeof o==='object'&&!Array.isArray(o)?Object.keys(o).sort().reduce((m,k)=>(m[k]=so(o[k]),m),{}):o;" +
          "const deq=(a,b)=>JSON.stringify(so(a))===JSON.stringify(so(b));" +
          "const T=[" +
          "['?a=1&b=2',{a:'1',b:'2'}]," +
          "['a=hello+world',{a:'hello world'}]," +
          "['a=%26x',{a:'&x'}]," +
          "['a=1&a=2&a=3',{a:['1','2','3']}]," + // repeat → array
          "['flag&a=1',{flag:'',a:'1'}]," + // bare key → ''
          "['a=1&&b=2',{a:'1',b:'2'}]" + // empty pair ignored
          "];for(const e of T){let r;try{r=f(e[0])}catch(_){r=null}if(deq(r,e[1]))ok++;}" +
          "console.log(ok+'/'+T.length);",
      );
      return ok === total && total > 0 ? 1 : 0;
    },
  },
  {
    name: "roman-numerals",
    files: {
      "in.txt": "Integer to Roman numerals — subtractive notation is the trap.",
    },
    task:
      "Read in.txt. Write `toRoman(n)` to sol.js and export it with " +
      "`module.exports = { toRoman }`. Convert an integer 1..3999 to a Roman numeral " +
      "string. Get the SUBTRACTIVE forms right: 4=IV, 9=IX, 40=XL, 90=XC, 400=CD, " +
      "900=CM (not IIII, VIIII, etc). Then briefly explain. Stop.",
    check: (ctx) => {
      const { ok, total } = runHarness(
        ctx,
        RESOLVE("toRoman") +
          "const eqs=(a,b)=>String(a)===String(b);" +
          "const T=[[4,'IV'],[9,'IX'],[40,'XL'],[90,'XC'],[400,'CD'],[900,'CM']," +
          "[58,'LVIII'],[1994,'MCMXCIV'],[3888,'MMMDCCCLXXXVIII']];" +
          "for(const e of T){let r;try{r=f(e[0])}catch(_){r=null}if(eqs(r,e[1]))ok++;}" +
          "console.log(ok+'/'+T.length);",
      );
      return ok === total && total > 0 ? 1 : 0;
    },
  },
];

/** Look up a headroom task by name. */
export function headroomTask(name) {
  return HEADROOM_TASKS.find((t) => t.name === name);
}
