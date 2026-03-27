#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];

if (command === "install-skills") {
  const { installSkills } = await import("./install-skills.mjs");
  installSkills();
} else if (command === "validate") {
  const { runValidate } = await import("./validate.mjs");
  runValidate(args.slice(1));
} else if (
  !command ||
  command.startsWith("-") ||
  command.includes(".") ||
  command.includes("/")
) {
  // No command, flags, or file paths — default to validate
  const { runValidate } = await import("./validate.mjs");
  runValidate(args);
} else {
  console.error(`Unknown command: ${command}`);
  console.error("");
  console.error("Usage:");
  console.error("  agent-lint [validate] [files...] [--follow-symlinks]");
  console.error("  agent-lint install-skills");
  process.exit(1);
}
