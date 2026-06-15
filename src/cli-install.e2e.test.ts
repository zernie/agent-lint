/**
 * e2e tier — the REAL Codex skill install (`npx skills add … -a codex -g -y`).
 *
 * pillar-2 evals and the unit `planPluginInstall` tests assert WHICH command we
 * run; this proves the command actually installs, for real, against the live
 * cross-agent `skills` CLI + the GitHub `zernie/vigiles` repo. It needs npx +
 * network (the top of the pyramid), so it lives in `vigiles/e2e` and self-skips
 * (loudly, via vitest's skipIf) where the CLI/network isn't reachable — e.g. an
 * offline sandbox — instead of failing red.
 *
 * It runs inside an ISOLATED $HOME (and cwd), so the global install lands in a
 * throwaway dir, never the developer's real ~/.agents or this repo.
 *
 * This is the test that caught the doc being wrong: `-a codex -g` installs to
 * ~/.agents/skills/, NOT the documented ~/.codex/skills/.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { planPluginInstall } from "./setup-plan.js";

/** Can we run the cross-agent `skills` CLI? (needs npx + network) */
function skillsCliAvailable(): boolean {
  try {
    execSync("npx --yes skills@latest --help", {
      stdio: "ignore",
      timeout: 90000,
    });
    return true;
  } catch {
    return false;
  }
}

const skillsOk = skillsCliAvailable();

test.skipIf(!skillsOk)(
  "codex install: the planned `skills add … -a codex -g -y` installs globally, not into the repo",
  () => {
    // The command we assert is exactly the one `vigiles init` would run.
    const [plan] = planPluginInstall(["codex"], { hasClaude: false });
    const cmd = plan.commands[0];
    assert.match(cmd, /^npx --yes skills add zernie\/vigiles -a codex -g -y$/);
    assert.equal(plan.vendors, false);

    // Isolated HOME + cwd so the global install can't touch the real machine.
    const home = mkdtempSync(join(tmpdir(), "vigiles-codex-home-"));
    const work = mkdtempSync(join(tmpdir(), "vigiles-codex-work-"));
    try {
      execSync(cmd, {
        cwd: work,
        env: { ...process.env, HOME: home },
        stdio: "pipe",
        timeout: 240000,
      });

      // It installs to the global agents store (~/.agents/skills/) — verified
      // location, NOT the documented ~/.codex/skills/, and NOT the repo/cwd.
      const store = join(home, ".agents", "skills");
      assert.ok(existsSync(store), `expected the global store at ${store}`);
      const installed = readdirSync(store);
      assert.ok(
        installed.length > 0,
        `expected installed vigiles skills, got ${JSON.stringify(installed)}`,
      );

      // The whole point of `-g`: nothing vendored into the working tree.
      assert.ok(
        !existsSync(join(work, ".agents")),
        "global install must not vendor .agents into the repo/cwd",
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
    }
  },
);
