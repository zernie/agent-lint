import { describe, it, expect } from "vitest";
import {
  mergeHooksJson,
  mergeHooksToml,
  normalizeHookRef,
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

  // Measured 2026-08-03: `vigiles compile x.hook.ts` then
  // `vigiles compile ./x.hook.ts` appended a SECOND {matcher, hooks:[…]} block
  // for the same hook, because the merge key was the raw string the user typed
  // and `"… run-program x.hook.mjs".includes("./x.hook.mjs")` is false. A few
  // edit-compile iterations left duplicate wirings that all fire.
  it("is idempotent across path SPELLINGS of the same file", () => {
    const spellings = [
      ".vigiles/hooks/g.mjs",
      "./.vigiles/hooks/g.mjs",
      ".vigiles//hooks/g.mjs",
      ".vigiles/hooks/../hooks/g.mjs",
      join(process.cwd(), ".vigiles/hooks/g.mjs"),
    ];
    let settings = mergeHooksJson({}, compiled, spellings[0] ?? "");
    for (const spelling of spellings.slice(1)) {
      settings = mergeHooksJson(settings, compiled, spelling);
    }
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
  });

  it("replaces an entry written with a DIFFERENT spelling (migrates old dupes)", () => {
    const legacy = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command" as const,
                command:
                  "npx vigiles hook-runtime run-program ./.vigiles/hooks/g.mjs",
              },
            ],
          },
        ],
      },
    };
    const out = mergeHooksJson(legacy, compiled, ".vigiles/hooks/g.mjs");
    expect(out.hooks?.PreToolUse).toHaveLength(1);
  });

  it("does NOT treat a path that merely CONTAINS ours as the same hook", () => {
    // The old substring test said `my-g.mjs` was managed by `g.mjs`.
    const neighbour = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command" as const,
                command:
                  "npx vigiles hook-runtime run-program .vigiles/hooks/my-g.mjs",
              },
            ],
          },
        ],
      },
    };
    const out = mergeHooksJson(neighbour, compiled, ".vigiles/hooks/g.mjs");
    expect(out.hooks?.PreToolUse).toHaveLength(2);
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

  it("is idempotent across path spellings too", () => {
    const once = mergeHooksToml({}, compiled, "./.vigiles/hooks/g.mjs");
    const twice = mergeHooksToml(once, compiled, ".vigiles/hooks/g.mjs");
    expect(twice.hooks?.PreToolUse).toHaveLength(1);
  });
});

describe("normalizeHookRef", () => {
  it("canonicalizes every spelling of one file to the same ref", () => {
    const cwd = process.cwd();
    const refs = [
      ".vigiles/hooks/g.mjs",
      "./.vigiles/hooks/g.mjs",
      ".vigiles/hooks/../hooks/g.mjs",
      join(cwd, ".vigiles/hooks/g.mjs"),
    ].map((p) => normalizeHookRef(p, cwd));
    expect(new Set(refs).size).toBe(1);
    expect(refs[0]).toBe(".vigiles/hooks/g.mjs");
  });

  it("keeps a path outside the cwd absolute (still stable)", () => {
    const cwd = join(tmpdir(), "vig-cwd");
    const ref = normalizeHookRef(join(tmpdir(), "elsewhere/h.mjs"), cwd);
    expect(ref.endsWith("elsewhere/h.mjs")).toBe(true);
    expect(normalizeHookRef(ref, cwd)).toBe(ref); // idempotent
  });

  it("emits POSIX separators so the ref is platform-stable", () => {
    expect(normalizeHookRef(".vigiles/hooks/g.mjs")).not.toMatch(/\\/);
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
