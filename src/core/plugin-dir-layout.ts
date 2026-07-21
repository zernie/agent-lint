/**
 * vigiles — plugin manifest directory layout verification.
 *
 * The #1 plugin-author mistake (OSS pain #E1): placing functional surface
 * directories (skills/, agents/, commands/, hooks/) INSIDE the `.claude-plugin/`
 * manifest directory instead of at the plugin root. The harness resolves surface
 * dirs relative to the PLUGIN ROOT (where the agent is launched), not relative to
 * the manifest directory — so a `skills/` nested inside `.claude-plugin/` is
 * completely invisible to the harness. Only `plugin.json` belongs inside the
 * manifest directory; everything else must live at the root.
 *
 * Pure + FP-safe + node-free: the only IO is a REQUIRED, injected `existsSync`
 * and `isDirectory` (the disk caller passes `node:fs`; the browser engine passes
 * a map-backed pair), so the detector is fully testable with fakes, never touches
 * the filesystem in tests, and statically imports no `node:` builtin — it bundles
 * clean in a browser (path ops come from the node-free `posix-path`).
 *
 * Harness-agnostic: the surface directory names are INJECTED from the layout
 * (PluginLayout.skillDir / agentDir / commandDir / hookDir, or equivalent), never
 * hard-coded here. ONE detector reused by both `vigiles lint` (the
 * `plugin-dir-layout` rule) and `vigiles audit` (the read-only report) — one
 * detector, no drift.
 */
import { basename, join } from "../posix-path.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A functional surface directory found nested inside the manifest directory. */
export interface PluginLayoutFinding {
  /** The misplaced surface directory name (e.g. `"skills"`). */
  readonly dir: string;
  /** Human-readable explanation + fix. */
  readonly message: string;
}

export interface PluginLayoutOptions {
  /** REQUIRED, injected: does this path exist? (disk: node:fs existsSync) */
  readonly existsSync: (p: string) => boolean;
  /**
   * REQUIRED, injected: is this path a directory? (disk: node:fs
   * statSync(p).isDirectory(), returning false on any throw)
   */
  readonly isDirectory: (p: string) => boolean;
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

/**
 * Surface directories found nested INSIDE the manifest directory, where they are
 * invisible to the harness.
 *
 * `manifestDir` is the absolute path to the manifest directory (e.g. the repo's
 * `.claude-plugin/`). `surfaceDirNames` are the harness's functional surface
 * directory names, injected from the layout (e.g. `["skills","agents","commands",
 * "hooks"]`) so the detector stays harness-agnostic — NEVER hard-code them.
 *
 * Returns `[]` when the manifest dir doesn't exist or holds no misplaced surface
 * dirs.
 */
export function pluginDirLayoutIssues(
  manifestDir: string,
  surfaceDirNames: readonly string[],
  opts: PluginLayoutOptions,
): PluginLayoutFinding[] {
  const exists = opts.existsSync;
  const isDir = opts.isDirectory;

  const manifestBase = basename(manifestDir);
  const findings: PluginLayoutFinding[] = [];

  for (const name of surfaceDirNames) {
    const candidate = join(manifestDir, name);
    if (exists(candidate) && isDir(candidate)) {
      findings.push({
        dir: name,
        message:
          `\`${name}/\` lives inside the \`${manifestBase}/\` manifest directory ` +
          `where the harness can't see it — only \`plugin.json\` belongs there; ` +
          `move \`${name}/\` to the plugin root.`,
      });
    }
  }

  return findings;
}
