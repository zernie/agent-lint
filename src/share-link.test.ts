import { describe, it, expect } from "vitest";
import {
  parseGitHubRemote,
  githubShareLink,
  shareLinkForRemote,
} from "./share-link.js";

describe("parseGitHubRemote", () => {
  it("parses the https form (with and without .git / trailing slash)", () => {
    expect(parseGitHubRemote("https://github.com/zernie/vigiles.git")).toEqual({
      owner: "zernie",
      repo: "vigiles",
    });
    expect(parseGitHubRemote("https://github.com/zernie/vigiles")).toEqual({
      owner: "zernie",
      repo: "vigiles",
    });
    expect(parseGitHubRemote("https://github.com/zernie/vigiles/")).toEqual({
      owner: "zernie",
      repo: "vigiles",
    });
  });

  it("parses the scp-like ssh form (git@github.com:owner/repo)", () => {
    expect(parseGitHubRemote("git@github.com:zernie/vigiles.git")).toEqual({
      owner: "zernie",
      repo: "vigiles",
    });
  });

  it("parses the ssh:// form", () => {
    expect(
      parseGitHubRemote("ssh://git@github.com/zernie/vigiles.git"),
    ).toEqual({ owner: "zernie", repo: "vigiles" });
  });

  it("tolerates surrounding whitespace (git config output)", () => {
    expect(parseGitHubRemote("  https://github.com/a/b\n")).toEqual({
      owner: "a",
      repo: "b",
    });
  });

  it("keeps a hyphenated / dotted repo name intact", () => {
    expect(
      parseGitHubRemote("https://github.com/some-org/my.cool.repo"),
    ).toEqual({ owner: "some-org", repo: "my.cool.repo" });
  });

  it("returns null for a non-GitHub host", () => {
    expect(parseGitHubRemote("https://gitlab.com/o/r.git")).toBeNull();
    expect(parseGitHubRemote("git@bitbucket.org:o/r.git")).toBeNull();
    expect(parseGitHubRemote("https://github.enterprise.corp/o/r")).toBeNull();
  });

  it("returns null for empty / unparseable input", () => {
    expect(parseGitHubRemote("")).toBeNull();
    expect(parseGitHubRemote("   ")).toBeNull();
    expect(parseGitHubRemote("not a url")).toBeNull();
  });

  it("rejects a deeper github path rather than mislabeling it", () => {
    expect(
      parseGitHubRemote("https://github.com/owner/repo/tree/main"),
    ).toBeNull();
  });
});

describe("githubShareLink", () => {
  it("builds the vigiles.sh deep-link", () => {
    expect(githubShareLink({ owner: "zernie", repo: "vigiles" })).toBe(
      "https://vigiles.sh/?repo=zernie/vigiles",
    );
  });
});

describe("shareLinkForRemote", () => {
  it("returns the link for a GitHub remote", () => {
    expect(shareLinkForRemote("git@github.com:zernie/vigiles.git")).toBe(
      "https://vigiles.sh/?repo=zernie/vigiles",
    );
  });

  it("returns null for a non-GitHub remote", () => {
    expect(shareLinkForRemote("https://gitlab.com/o/r")).toBeNull();
    expect(shareLinkForRemote("")).toBeNull();
  });
});
