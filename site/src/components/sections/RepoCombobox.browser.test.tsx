/**
 * RepoCombobox interaction tests (real Chromium). Both GitHub lookups are injected via
 * `searchOwner` / `searchByName`, so these drive the autocomplete with mock data — no
 * network, and the same seam the api.github.com-blocked sandbox uses to screenshot the
 * dropdown. Covers: bare name → global by-name search (no owner needed); owner/ →
 * scoped filter; keyboard pick; direct owner/repo submit (autocomplete never gates);
 * rate-limit degrades to the direct path.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { RepoCombobox } from "./RepoCombobox";
import {
  rankRepos,
  formatStars,
  type RepoHit,
  type SearchOutcome,
} from "@/demo/searchRepos";

afterEach(cleanup);

const OBRA_REPOS: RepoHit[] = [
  {
    name: "superpowers",
    fullName: "obra/superpowers",
    stars: 4200,
    description: "An agentic skills framework.",
    fork: false,
    archived: false,
  },
  {
    name: "super-tiny",
    fullName: "obra/super-tiny",
    stars: 12,
    description: null,
    fork: false,
    archived: false,
  },
  {
    name: "unrelated",
    fullName: "obra/unrelated",
    stars: 999,
    description: "Something else.",
    fork: false,
    archived: false,
  },
];

const NAME_HITS: RepoHit[] = [
  {
    name: "superpowers",
    fullName: "obra/superpowers",
    stars: 4200,
    description: "An agentic skills framework.",
    fork: false,
    archived: false,
  },
  {
    name: "superpowers",
    fullName: "someone/superpowers",
    stars: 30,
    description: "A fork-ish thing.",
    fork: false,
    archived: false,
  },
];

const ok = (repos: RepoHit[]) =>
  vi.fn(async (): Promise<SearchOutcome> => ({ kind: "ok", repos }));

describe("RepoCombobox — autocomplete", () => {
  it("a bare repo name searches across GitHub (no owner needed) and shows owner/name", async () => {
    const searchByName = ok(NAME_HITS);
    const searchOwner = ok(OBRA_REPOS);
    render(
      <RepoCombobox
        onSubmit={vi.fn()}
        searchByName={searchByName}
        searchOwner={searchOwner}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "superpowers");

    await waitFor(() =>
      expect(searchByName).toHaveBeenCalledWith(
        "superpowers",
        expect.anything(),
      ),
    );
    // The by-name mode is used, not the owner lookup.
    expect(searchOwner).not.toHaveBeenCalled();
    // Rows show owner/name (the owner spans, so it must be visible) + stars.
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /obra\/superpowers/ }),
      ).toBeTruthy(),
    );
    expect(screen.getByText("4.2k")).toBeTruthy();
  });

  it("a slash scopes to that owner and filters client-side", async () => {
    const searchOwner = ok(OBRA_REPOS);
    render(
      <RepoCombobox
        onSubmit={vi.fn()}
        searchOwner={searchOwner}
        searchByName={ok([])}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "obra/super");

    await waitFor(() =>
      expect(searchOwner).toHaveBeenCalledWith("obra", expect.anything()),
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /superpowers/ })).toBeTruthy(),
    );
    // "unrelated" doesn't match the "super" fragment → filtered out.
    expect(screen.queryByRole("option", { name: /unrelated/ })).toBeNull();
    // The owner is fetched ONCE (cached), not per fragment keystroke.
    expect(searchOwner).toHaveBeenCalledTimes(1);
  });

  it("picks a suggestion with keyboard → submits its full slug", async () => {
    const onSubmit = vi.fn();
    render(
      <RepoCombobox
        onSubmit={onSubmit}
        searchByName={ok(NAME_HITS)}
        searchOwner={ok(OBRA_REPOS)}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "superpowers");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /obra\/superpowers/ }),
      ).toBeTruthy(),
    );
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("obra/superpowers");
  });

  it("submits a directly-typed owner/repo even with no suggestions (autocomplete never gates)", async () => {
    const onSubmit = vi.fn();
    render(
      <RepoCombobox
        onSubmit={onSubmit}
        searchOwner={vi.fn(
          async () => ({ kind: "not-found" }) as SearchOutcome,
        )}
        searchByName={ok([])}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "someone/thing{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("someone/thing");
  });

  it("rate-limit shows the direct-path note, and the direct submit still works", async () => {
    const onSubmit = vi.fn();
    render(
      <RepoCombobox
        onSubmit={onSubmit}
        searchByName={vi.fn(
          async () => ({ kind: "rate-limit" }) as SearchOutcome,
        )}
        searchOwner={ok(OBRA_REPOS)}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "superpowers");
    await waitFor(() =>
      expect(screen.getByText(/anonymous rate limit/i)).toBeTruthy(),
    );

    await user.clear(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "obra/superpowers{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("obra/superpowers");
  });
});

describe("rankRepos / formatStars", () => {
  it("prefix beats substring, then stars; empty fragment ranks by stars", () => {
    const ranked = rankRepos(OBRA_REPOS, "super");
    expect(ranked.map((r) => r.name)).toEqual(["superpowers", "super-tiny"]);
    const top = rankRepos(OBRA_REPOS, "");
    expect(top[0].name).toBe("superpowers"); // most stars first
  });

  it("formats star counts compactly", () => {
    expect(formatStars(999)).toBe("999");
    expect(formatStars(1234)).toBe("1.2k");
    expect(formatStars(38116)).toBe("38k");
  });
});
