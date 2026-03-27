import { cpSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_SOURCE = join(__dirname, ".claude", "skills");

export function installSkills(targetDir = process.cwd()) {
  if (!existsSync(SKILLS_SOURCE)) {
    console.error("Skills directory not found in package.");
    process.exit(1);
  }

  const dest = join(targetDir, ".claude", "skills");
  cpSync(SKILLS_SOURCE, dest, { recursive: true });

  const installed = readdirSync(dest);
  console.log(`Installed ${installed.length} skill(s) to ${dest}:`);
  for (const name of installed) {
    console.log(`  - ${name}`);
  }
}
