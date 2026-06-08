#!/usr/bin/env bash
# Observer hook (non-blocking): append "tool<TAB>path<TAB>command" for each tool
# call to .trace in the current working directory. Tool-agnostic so it records
# files created via Bash heredocs, not just the Edit/Write tools.
jq -r '[.tool_name, (.tool_input.file_path // ""), (.tool_input.command // "")] | @tsv' >> .trace 2>/dev/null
exit 0
