/**
 * DRIFT GUARD for the battery shown in the Guard section.
 *
 * Guard.tsx retypes the engine's DISASTER_CATALOG, because the site cannot
 * import it: `guardrail-check` reaches node:child_process through `run-hook`,
 * and there is no browser shim for spawning a process (unlike node:zlib, which
 * the demo aliases to pako). A retyped list is a list that drifts — so the rows
 * are pinned here to a fixture GENERATED from the real catalog by
 * `scripts/gen-battery-expected.mjs`, which runs as `pretest:browser`.
 *
 * If this fails, the catalog moved and the landing page is quoting a battery the
 * engine no longer runs. Fix Guard.tsx (and re-check the 2-of-7 / 7-of-7 copy,
 * which is derived from these rows) — never the fixture, which is generated.
 *
 * Same trick, same reason as src/demo/browser-parity.browser.test.ts.
 */
import { describe, it, expect } from "vitest";
import { BATTERY_ROWS } from "./Guard";
import fixture from "./__fixtures__/disaster-battery.json";

describe("the Guard section quotes the engine's real disaster battery", () => {
  it("shows exactly the catalog's events, in order, with verbatim commands", () => {
    expect(
      BATTERY_ROWS.map((r) => ({ id: r.id, command: r.command })),
      "Guard.tsx's battery no longer matches DISASTER_CATALOG. The fixture is " +
        "regenerated from the engine before this test runs, so this is a real " +
        "drift: update Guard.tsx, not the fixture.",
    ).toEqual(fixture.events.map((e) => ({ id: e.id, command: e.command })));
  });

  it("the blocklist column matches what the CI dogfood asserts, row by row", () => {
    // The headline "blocks 2 of 7" is DERIVED from these flags, so pinning the
    // flags pins the headline. BOTH directions are pinned, because the page
    // shows a mark on every row: these exact ids are the ones
    // src/hook-dogfood.test.ts asserts the substring-blocklist guard blocks,
    // and these exact five are the ones it asserts it misses. The page cannot
    // put a mark on a row nobody ran.
    expect(BATTERY_ROWS).toHaveLength(7);
    expect(
      BATTERY_ROWS.filter((r) => r.blocklistBlocks).map((r) => r.id),
    ).toEqual(["force-push", "rm-rf"]);
    expect(
      BATTERY_ROWS.filter((r) => !r.blocklistBlocks).map((r) => r.id),
    ).toEqual([
      "force-push-compound",
      "reset-hard",
      "no-verify-commit",
      "read-ssh-key",
      "curl-pipe-sh",
    ]);
  });
});
