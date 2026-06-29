/**
 * No-model self-check for the HEADROOM corpus: prove each task's EXECUTING check
 * discriminates a known-GOOD vs known-BAD solution. A check that always returns 1
 * (or always 0) would silently void the headroom benchmark. Run:
 *   node bench/corpus/verify-headroom.mjs    # exit 0 all-pass / 1 on any failure
 */
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HEADROOM_TASKS } from "./headroom-tasks.mjs";

// A minimal eval-ctx over a real temp dir (file + sh, like the real RunContext).
function ctxFor(dir) {
  return {
    file: (p) => {
      try {
        return readFileSync(join(dir, p), "utf-8");
      } catch {
        return undefined;
      }
    },
    sh: (cmd) => {
      try {
        return execSync(cmd, {
          cwd: dir,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch (e) {
        return (e.stdout ?? "").toString().trim();
      }
    },
  };
}

// Known-good (passes every edge) and known-bad (fails a specific edge) solutions.
const SOLUTIONS = {
  "merge-intervals": {
    good: `module.exports={mergeIntervals:function(iv){const a=iv.slice().sort((x,y)=>x[0]-y[0]);const out=[];for(const p of a){const s=p[0],e=p[1];if(out.length&&s<=out[out.length-1][1])out[out.length-1][1]=Math.max(out[out.length-1][1],e);else out.push([s,e]);}return out;}};`,
    // BAD: doesn't SORT first → fails the unsorted case.
    bad: `module.exports={mergeIntervals:function(iv){const out=[];for(const p of iv){const s=p[0],e=p[1];if(out.length&&s<=out[out.length-1][1])out[out.length-1][1]=Math.max(out[out.length-1][1],e);else out.push([s,e]);}return out;}};`,
  },
  "parse-query": {
    good: `module.exports={parseQuery:function(qs){qs=String(qs).replace(/^\\?/,'');const out={};for(const pair of qs.split('&')){if(pair==='')continue;const i=pair.indexOf('=');let k,v;if(i===-1){k=pair;v='';}else{k=pair.slice(0,i);v=pair.slice(i+1);}const dec=(s)=>decodeURIComponent(s.replace(/\\+/g,' '));k=dec(k);v=dec(v);if(Object.prototype.hasOwnProperty.call(out,k)){if(Array.isArray(out[k]))out[k].push(v);else out[k]=[out[k],v];}else out[k]=v;}return out;}};`,
    // BAD: naive split — overwrites repeated keys (rule 4) AND keeps the empty pair (rule 6).
    bad: `module.exports={parseQuery:function(qs){qs=String(qs).replace(/^\\?/,'');const out={};for(const pair of qs.split('&')){const parts=pair.split('=');const dec=(s)=>decodeURIComponent(String(s||'').replace(/\\+/g,' '));out[dec(parts[0])]=dec(parts[1]);}return out;}};`,
  },
  "roman-numerals": {
    good: `module.exports={toRoman:function(n){const v=[1000,900,500,400,100,90,50,40,10,9,5,4,1];const s=['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];let r='';for(let i=0;i<v.length;i++){while(n>=v[i]){r+=s[i];n-=v[i];}}return r;}};`,
    // BAD: no SUBTRACTIVE forms → 4 becomes IIII, etc.
    bad: `module.exports={toRoman:function(n){const v=[1000,500,100,50,10,5,1];const s=['M','D','C','L','X','V','I'];let r='';for(let i=0;i<v.length;i++){while(n>=v[i]){r+=s[i];n-=v[i];}}return r;}};`,
  },
};

let failed = 0;
for (const t of HEADROOM_TASKS) {
  const sol = SOLUTIONS[t.name];
  if (!sol) {
    console.log(`✗ ${t.name}: no known-good/bad solution in verify`);
    failed++;
    continue;
  }
  for (const [kind, expected] of [
    ["good", 1],
    ["bad", 0],
  ]) {
    const dir = mkdtempSync(join(tmpdir(), "verify-headroom-"));
    try {
      writeFileSync(join(dir, "sol.js"), sol[kind]);
      const got = t.check(ctxFor(dir));
      const ok = got === expected;
      console.log(
        `${ok ? "✓" : "✗"} ${t.name} [${kind}] → ${got} (expected ${expected})`,
      );
      if (!ok) failed++;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
console.log(
  failed === 0
    ? "\nAll headroom checks discriminate good vs bad."
    : `\n${failed} check(s) did NOT discriminate.`,
);
process.exit(failed === 0 ? 0 : 1);
