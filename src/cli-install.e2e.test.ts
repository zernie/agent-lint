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

/** A failure of the real `skills add` that's the NETWORK's fault, not a bug. */
function isNetworkFailure(e: unknown): boolean {
  const err = e as { message?: unknown; stderr?: unknown; stdout?: unknown };
  const str = (p: unknown): string => {
    if (typeof p === "string") return p;
    if (Buffer.isBuffer(p)) return p.toString("utf-8");
    return p == null ? "" : JSON.stringify(p);
  };
  // execSync puts the command in `.message` and the real reason in `.stderr`.
  const text = [err.message, err.stderr, err.stdout].map(str).join("\n");
  return /ENOTFOUND|EAI_AGAIN|getaddrinfo|Could not resolve|unable to access|ETIMEDOUT|ECONNREFUSED|ECONNRESET|network|proxy|self.signed|certificate|TLS|SSL|fatal:|git clone|403|404|429|ENETUNREACH|registry|fetch failed/i.test(
    text,
  );
}

test.skipIf(!skillsOk)(
  "codex install: the planned `skills add … -a codex -g -y` installs globally, not into the repo",
  (ctx) => {
    // The command we assert is exactly the one `vigiles init` would run.
    const [plan] = planPluginInstall(["codex"], { hasClaude: false });
    const cmd = plan.commands[0];
    assert.match(cmd, /^npx --yes skills add zernie\/vigiles -a codex -g -y$/);
    assert.equal(plan.vendors, false);

    // Isolated HOME + cwd so the global install can't touch the real machine.
    const home = mkdtempSync(join(tmpdir(), "vigiles-codex-home-"));
    const work = mkdtempSync(join(tmpdir(), "vigiles-codex-work-"));
    try {
      try {
        execSync(cmd, {
          cwd: work,
          env: { ...process.env, HOME: home },
          stdio: "pipe",
          timeout: 240000,
        });
      } catch (e) {
        // `skills --help` was reachable but the real `add` (a GitHub fetch)
        // wasn't — a partial-network sandbox. Skip LOUDLY, don't fail red (the
        // documented contract); a real install bug still throws.
        if (isNetworkFailure(e)) {
          ctx.skip(
            `skills add could not reach the network (sandbox): ${String(
              (e as { message?: unknown }).message ?? e,
            ).slice(0, 200)}`,
          );
          return;
        }
        throw e;
      }

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
