#!/usr/bin/env bash
# Re-measure the symbol-ref benchmark from the saved per-run workdirs (no agent
# re-runs). Each bench/.work-refs/<arm>__<trial>/ holds the SKILL.md the agent
# produced and the fixture source; we recompute the metrics cleanly.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
WORK="$ROOT/bench/.work-refs"
OUT="$ROOT/bench/results-refs.csv"

echo "arm,trial,marks,ignores,broken,names,catch_rename" > "$OUT"
for d in "$WORK"/*/; do
  [ -f "$d/SKILL.md" ] || continue
  name=$(basename "$d"); arm=${name%%__*}; trial=${name##*__}
  marks=$(grep -c "vigiles:symbol" "$d/SKILL.md")
  ignores=$(grep -c "vigiles:ignore" "$d/SKILL.md")
  names=$(grep -c "chargeCard" "$d/SKILL.md")
  broken=$( (cd "$d" && node "$CLI" refs SKILL.md 2>/dev/null | grep -c "^  - line") )
  # rename the documented function in this run's own source, see if audit flags it
  catch="no"
  if grep -q "chargeCard" "$d/src/billing.ts"; then
    cp "$d/src/billing.ts" /tmp/bk.ts
    sed -i 's/chargeCard/captureCard/g' "$d/src/billing.ts"
    if (cd "$d" && node "$CLI" audit SKILL.md 2>/dev/null | grep -q "chargeCard.*not defined"); then catch="yes"; fi
    cp /tmp/bk.ts "$d/src/billing.ts"
  fi
  echo "$arm,$trial,$marks,$ignores,$broken,$names,$catch" >> "$OUT"
done

echo "=== SUMMARY-REFS (re-measured) ==="
for arm in vanilla gated; do
  awk -F, -v a="$arm" 'NR>1 && $1==a {
      n++; m+=$3; ig+=$4; br+=$5; if($6+0>0)named++; if($7=="yes")caught++ }
    END{ if(n) printf "  %-8s runs=%d avg_marks=%.1f avg_ignores=%.1f broken_total=%d named=%d/%d  CATCH_RENAME=%d/%d\n",
        a,n,m/n,ig/n,br+0,named+0,n,caught+0,n }' "$OUT"
done
