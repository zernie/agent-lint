import { describe, it, expect } from "vitest";
import {
  mergeHooksJson,
  mergeHooksToml,
  serializeConfig,
  discoverHookFiles,
} from "./hook-install.js";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const compiled = {
  PreToolUse: [
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command" as const,
          command: "npx vigiles hook-runtime run-program .vigiles/hooks/g.mjs",
        },
      ],
    },
  ],
};

describe("mergeHooksJson", () => {
  it("adds the hook block to an empty settings object", () => {
    const out = mergeHooksJson({}, compiled, ".vigiles/hooks/g.mjs");
    expect(out.hooks?.PreToolUse).toHaveLength(1);
    expect(out.hooks?.PreToolUse[0].hooks[0].command).toMatch(/g\.mjs/);
  });

  it("preserves the user's own unrelated hooks", () => {
    const existing = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Write",
            hooks: [{ type: "command" as const, command: "mine" }],
          },
        ],
      },
    };
    const out = mergeHooksJson(existing, compiled, ".vigiles/hooks/g.mjs");
    // The user's entry stays; ours is appended.
    expect(out.hooks?.PreToolUse).toHaveLength(2);
    expect(out.hooks?.PreToolUse[0].hooks[0].command).toBe("mine");
  });

  it("is idempotent — recompiling replaces our entry, never duplicates", () => {
    const once = mergeHooksJson({}, compiled, ".vigiles/hooks/g.mjs");
    const twice = mergeHooksJson(once, compiled, ".vigiles/hooks/g.mjs");
    expect(twice.hooks?.PreToolUse).toHaveLength(1);
  });

  it("keeps a sibling vigiles hook for a DIFFERENT file", () => {
    const other = {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command" as const,
              command:
                "npx vigiles hook-runtime run-program .vigiles/hooks/other.mjs",
            },
          ],
        },
      ],
    };
    const first = mergeHooksJson({}, other, ".vigiles/hooks/other.mjs");
    const both = mergeHooksJson(first, compiled, ".vigiles/hooks/g.mjs");
    expect(both.hooks?.PreToolUse).toHaveLength(2);
  });

  it("preserves non-hook top-level settings keys", () => {
    const out = mergeHooksJson(
      { permissions: { allow: ["Bash"] } },
      compiled,
      ".vigiles/hooks/g.mjs",
    );
    expect(out.permissions).toEqual({ allow: ["Bash"] });
  });
});

describe("mergeHooksToml", () => {
  it("flattens to Codex's {matcher, command} shape and round-trips", () => {
    const out = mergeHooksToml({}, compiled, ".vigiles/hooks/g.mjs");
    const toml = serializeConfig(out, "toml");
    expect(toml).toMatch(/\[\[hooks\.PreToolUse\]\]/);
    expect(toml).toMatch(/matcher = "Bash"/);
    expect(toml).toMatch(/g\.mjs/);
  });

  it("is idempotent by hook path", () => {
    const once = mergeHooksToml({}, compiled, ".vigiles/hooks/g.mjs");
    const twice = mergeHooksToml(once, compiled, ".vigiles/hooks/g.mjs");
    expect(twice.hooks?.PreToolUse).toHaveLength(1);
  });
});

describe("discoverHookFiles", () => {
  it("finds JS/TS sources under .vigiles/hooks, excludes stamps", () => {
    const dir = mkdtempSync(join(tmpdir(), "vig-hooks-"));
    try {
      mkdirSync(join(dir, ".vigiles/hooks"), { recursive: true });
      writeFileSync(join(dir, ".vigiles/hooks/a.mjs"), "");
      writeFileSync(join(dir, ".vigiles/hooks/b.ts"), "");
      writeFileSync(join(dir, ".vigiles/hooks/a.mjs.json"), "{}"); // stamp
      const found = discoverHookFiles(dir);
      expect(found).toEqual([
        join(".vigiles/hooks", "a.mjs"),
        join(".vigiles/hooks", "b.ts"),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns [] when the dir is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "vig-nohooks-"));
    try {
      expect(discoverHookFiles(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
