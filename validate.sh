#!/usr/bin/env bash
set -euo pipefail

CLAUDE_MD="${1:-CLAUDE.md}"

if [ ! -f "$CLAUDE_MD" ]; then
  echo "::error::CLAUDE.md not found at $CLAUDE_MD"
  exit 1
fi

enforced=0
guidance=0
missing=0
missing_rules=""

current_rule=""
current_line=0
found_annotation=false

while IFS= read -r line || [ -n "$line" ]; do
  current_line=$((current_line + 1))

  # New rule header
  if [[ "$line" =~ ^###[[:space:]]+(.+)$ ]]; then
    # Check previous rule
    if [ -n "$current_rule" ] && [ "$found_annotation" = false ]; then
      missing=$((missing + 1))
      missing_rules="${missing_rules}  Line ${rule_start_line}: \"${current_rule}\"\n"
    fi

    current_rule="${BASH_REMATCH[1]}"
    rule_start_line=$current_line
    found_annotation=false
    continue
  fi

  # Skip if no current rule or already annotated
  if [ -z "$current_rule" ] || [ "$found_annotation" = true ]; then
    continue
  fi

  # Check for enforcement annotation
  if [[ "$line" =~ \*\*Enforced[[:space:]]by:\*\* ]]; then
    enforced=$((enforced + 1))
    found_annotation=true
    continue
  fi

  # Check for guidance annotation
  if [[ "$line" =~ \*\*Guidance[[:space:]]only\*\* ]]; then
    guidance=$((guidance + 1))
    found_annotation=true
    continue
  fi
done < "$CLAUDE_MD"

# Check last rule
if [ -n "$current_rule" ] && [ "$found_annotation" = false ]; then
  missing=$((missing + 1))
  missing_rules="${missing_rules}  Line ${rule_start_line}: \"${current_rule}\"\n"
fi

total=$((enforced + guidance + missing))

echo ""
echo "CLAUDE.md Validation Report"
echo "$(printf '=%.0s' {1..40})"
echo "  Total rules:    $total"
echo "  Enforced:       $enforced"
echo "  Guidance only:  $guidance"
echo "  Missing:        $missing"
echo "$(printf '=%.0s' {1..40})"

if [ "$missing" -gt 0 ]; then
  echo ""
  echo "Rules missing enforcement annotations:"
  echo -e "$missing_rules"
  echo "Add **Enforced by:** \`<rule>\` or **Guidance only** to each rule."
  echo ""
  echo "::error::$missing rule(s) in CLAUDE.md are missing enforcement annotations"
  exit 1
fi

if [ "$total" -eq 0 ]; then
  echo ""
  echo "No rules (### headings) found in $CLAUDE_MD"
  exit 0
fi

echo ""
echo "All rules have enforcement annotations."
