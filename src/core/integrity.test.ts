/**
 * Integrity-header tests — the hand-edit check plus the `eject` transform that
 * hands a compiled file back as plain, hand-owned markdown.
 */
import { describe, it, expect } from "vitest";
import {
  checkIntegrity,
  parseIntegrityHeader,
  ejectMarkdown,
  REQUIRE_INSTRUCTIONS_SPEC_DISABLE,
} from "./integrity.js";
import { sha256short } from "./hash.js";

/** Build a compiled-file string with a VALID header for `body`. */
function compiled(body: string, spec = "CLAUDE.md.spec.ts"): string {
  return `<!-- vigiles:sha256:${sha256short(body)} compiled from ${spec} -->\n\n${body}`;
}

describe("checkIntegrity", () => {
  it("accepts a file whose hash matches its body", () => {
    expect(checkIntegrity(compiled("# Title\n\nBody.\n")).intact).toBe(true);
  });

  it("flags a hand-edited compiled file (hash mismatch)", () => {
    const tampered = compiled("# Title\n").replace("Title", "Tampered");
    expect(checkIntegrity(tampered).intact).toBe(false);
  });

  it("treats a header-less file as hand-written (intact)", () => {
    expect(checkIntegrity("# Plain markdown\n").intact).toBe(true);
  });
});

describe("parseIntegrityHeader", () => {
  it("extracts the spec path and the body below the header", () => {
    const parsed = parseIntegrityHeader(
      compiled("# T\n\nB.\n", "AGENTS.md.spec.ts"),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.specFile).toBe("AGENTS.md.spec.ts");
    expect(parsed?.body).toBe("# T\n\nB.\n");
  });

  it("returns null for plain markdown (no header)", () => {
    expect(parseIntegrityHeader("# Plain\n")).toBeNull();
  });
});

describe("ejectMarkdown", () => {
  it("strips the header and prepends the require-instructions-spec disable marker", () => {
    const out = ejectMarkdown(compiled("# Title\n\nBody.\n"));
    expect(out).not.toBeNull();
    expect(out?.specFile).toBe("CLAUDE.md.spec.ts");
    expect(out?.markdown).toBe(
      `${REQUIRE_INSTRUCTIONS_SPEC_DISABLE}\n\n# Title\n\nBody.\n`,
    );
    // No integrity header remains.
    expect(out?.markdown.includes("vigiles:sha256")).toBe(false);
  });

  it("returns null when there is nothing to eject (no header)", () => {
    expect(ejectMarkdown("# Already plain\n")).toBeNull();
  });

  it("is idempotent — does not double-mark an already-disabled body", () => {
    const body = `${REQUIRE_INSTRUCTIONS_SPEC_DISABLE}\n\n# Title\n`;
    const out = ejectMarkdown(compiled(body));
    expect(out?.markdown).toBe(body);
    // Exactly one marker.
    expect(out?.markdown.split(REQUIRE_INSTRUCTIONS_SPEC_DISABLE).length).toBe(
      2,
    );
  });
});
