/**
 * DemoAudit interaction tests (real Chromium, `fetchRepo` mocked at the module
 * boundary). Covers the state machine from the Fable brief: typed run → honest
 * loading steps → report; instant baked chip; unparseable-input hint; and the
 * four in-frame edge states (no-harness / private-404 / rate-limit / error).
 * The `ok` path uses the REAL engine (`runAudit`) over the sample map, so it's a
 * true integration, not a mocked render.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import type { FetchOutcome, FetchProgress } from "@/demo/fetchRepo";
import sampleFiles from "@/demo/__fixtures__/sample-repo.files.json";

// Mock the fetch boundary; the engine (runAudit) stays REAL.
vi.mock("@/demo/fetchRepo", () => ({
  fetchRepo: vi.fn(),
}));
import { fetchRepo } from "@/demo/fetchRepo";
import { DemoAudit } from "./DemoAudit";

const mockFetch = vi.mocked(fetchRepo);

/** A fetchRepo impl that emits progress then resolves to `outcome` after `delay`ms. */
function scripted(
  outcome: FetchOutcome,
  opts: { delay?: number; progress?: FetchProgress[] } = {},
) {
  return async (
    _slug: string,
    onProgress?: (p: FetchProgress) => void,
  ): Promise<FetchOutcome> => {
    for (const p of opts.progress ?? []) onProgress?.(p);
    if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
    return outcome;
  };
}

beforeEach(() => {
  history.replaceState(null, "", "/"); // no ?repo= auto-run
  mockFetch.mockReset();
});
afterEach(cleanup);

async function typeRepo(slug: string): Promise<void> {
  const user = userEvent.setup();
  const input = screen.getByLabelText(/GitHub repo to grade/i);
  await user.click(input);
  await user.type(input, `${slug}{Enter}`);
}

describe("DemoAudit — typed run", () => {
  it("types a repo → shows honest loading steps → renders the real report", async () => {
    mockFetch.mockImplementation(
      scripted(
        {
          kind: "ok",
          files: sampleFiles as Record<string, string>,
          treeCount: 42,
          harnessCount: 4,
        },
        {
          delay: 300,
          progress: [
            { phase: "tree", treeCount: 42, harnessCount: 4 },
            { phase: "file", done: 4, of: 4 },
          ],
        },
      ),
    );
    render(<DemoAudit />);
    await typeRepo("acme/widgets");

    // Honest loading: the real tree count appears (suppressed <200ms, so findBy).
    await screen.findByText(/repo tree — 42 files/);

    // Then the real report renders (grade D from the sample map) + slug header.
    await screen.findByText(/acme\/widgets/);
    // The grade badge is a standalone "D" node (exact match, may co-exist with
    // the score line); the sample map deterministically grades D.
    await waitFor(() =>
      expect(screen.getAllByText("D").length).toBeGreaterThan(0),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "acme/widgets",
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it("shows an inline hint (no throw) on unparseable input", async () => {
    render(<DemoAudit />);
    await typeRepo("not a repo!!!");
    await screen.findByText(/paste a GitHub URL/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("DemoAudit — chips stay instant", () => {
  it("tapping a chip shows its baked report with NO fetch and NO loading", async () => {
    const user = userEvent.setup();
    render(<DemoAudit />);
    await user.click(screen.getByRole("button", { name: "oh-my-claudecode" }));
    // Baked report frame header updates instantly; fetch never called.
    await screen.findByText(/vigiles audit oh-my-claudecode/);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/fetching repo tree/)).toBeNull();
  });
});

describe("DemoAudit — the four in-frame edge states", () => {
  const cases: {
    name: string;
    outcome: FetchOutcome;
    expect: RegExp;
  }[] = [
    {
      name: "no-harness → empty",
      outcome: { kind: "no-harness", treeCount: 10 },
      expect: /No Claude Code harness in/i,
    },
    {
      name: "not-found → private/404",
      outcome: { kind: "not-found" },
      expect: /not found, or private/i,
    },
    {
      name: "rate-limit",
      outcome: { kind: "rate-limit" },
      expect: /anonymous API limit hit/i,
    },
    {
      name: "error",
      outcome: { kind: "error", message: "boom" },
      expect: /Couldn.t reach GitHub/i,
    },
  ];

  for (const c of cases) {
    it(`${c.name} renders inside the frame`, async () => {
      mockFetch.mockImplementation(scripted(c.outcome));
      render(<DemoAudit />);
      await typeRepo("acme/widgets");
      await screen.findByText(c.expect);
      // Same frame — the header still names the repo.
      expect(screen.getByText(/vigiles audit acme\/widgets/)).toBeTruthy();
    });
  }
});
