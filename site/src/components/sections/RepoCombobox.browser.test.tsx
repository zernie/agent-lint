/**
 * RepoCombobox interaction tests (real Chromium). The GitHub lookup is injected via
 * the `search` prop, so these drive the autocomplete with mock data — no network, and
 * the same seam the api.github.com-blocked sandbox uses to screenshot the dropdown.
 * Covers: owner → debounced lookup → starred suggestions; client-side fragment filter;
 * keyboard pick; direct owner/repo submit (autocomplete is never a gate); rate-limit
 * degrades to the direct path.
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

const REPOS: RepoHit[] = [
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

const okSearch = (repos: RepoHit[] = REPOS) =>
  vi.fn(async (): Promise<SearchOutcome> => ({ kind: "ok", repos }));

describe("RepoCombobox — autocomplete", () => {
  it("types an owner → debounced lookup → shows starred suggestions", async () => {
    const search = okSearch();
    const onSubmit = vi.fn();
    render(<RepoCombobox onSubmit={onSubmit} search={search} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "obra");

    await waitFor(() =>
      expect(search).toHaveBeenCalledWith("obra", expect.anything()),
    );
    // A suggestion row with its star count renders.
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /superpowers/ })).toBeTruthy(),
    );
    expect(screen.getByText("4.2k")).toBeTruthy();
  });

  it("filters the owner's repos client-side by the typed fragment", async () => {
    const search = okSearch();
    render(<RepoCombobox onSubmit={vi.fn()} search={search} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "obra/super");

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /superpowers/ })).toBeTruthy(),
    );
    // "unrelated" doesn't match the "super" fragment → filtered out.
    expect(screen.queryByRole("option", { name: /unrelated/ })).toBeNull();
    // The owner is fetched ONCE (cached), not per fragment keystroke.
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("picks a suggestion with keyboard → submits its full slug", async () => {
    const search = okSearch();
    const onSubmit = vi.fn();
    render(<RepoCombobox onSubmit={onSubmit} search={search} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "obra/super");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /superpowers/ })).toBeTruthy(),
    );
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("obra/superpowers");
  });

  it("submits a directly-typed owner/repo even with no suggestions (autocomplete never gates)", async () => {
    const search = vi.fn(
      async (): Promise<SearchOutcome> => ({ kind: "not-found" }),
    );
    const onSubmit = vi.fn();
    render(<RepoCombobox onSubmit={onSubmit} search={search} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "someone/thing{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("someone/thing");
  });

  it("rate-limit shows the direct-path note, and the direct submit still works", async () => {
    const search = vi.fn(
      async (): Promise<SearchOutcome> => ({ kind: "rate-limit" }),
    );
    const onSubmit = vi.fn();
    render(<RepoCombobox onSubmit={onSubmit} search={search} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "obra");
    await waitFor(() =>
      expect(screen.getByText(/anonymous rate limit/i)).toBeTruthy(),
    );

    await user.type(screen.getByRole("combobox"), "/superpowers{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("obra/superpowers");
  });
});

describe("rankRepos / formatStars", () => {
  it("prefix beats substring, then stars; empty fragment ranks by stars", () => {
    const ranked = rankRepos(REPOS, "super");
    expect(ranked.map((r) => r.name)).toEqual(["superpowers", "super-tiny"]);
    const top = rankRepos(REPOS, "");
    expect(top[0].name).toBe("superpowers"); // most stars first
  });

  it("formats star counts compactly", () => {
    expect(formatStars(999)).toBe("999");
    expect(formatStars(1234)).toBe("1.2k");
    expect(formatStars(38116)).toBe("38k");
  });
});
