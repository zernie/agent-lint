# Deterministic Bash effect classification (no LLM)

> Status: research synthesis (2026-06-20). The question: Claude Code uses an LLM permission
> classifier to decide whether a `Bash` tool call is safe/read-only/side-effecting. Can we do
> the same **deterministically — given the literal `command` string, with no model and without
> running it** — and ideally name the granular capability classes (write/delete/network/
> exec/process-control)? **Verdict: not _fully_ — full decidability is impossible (the residue
> is real, by Rice's theorem and runtime-dependent command identity). But a deterministic
> AST + command-catalog classifier handles the large common subset with high precision and
> FAIL-CLOSES the rest, so vigiles can replace the blanket "all `Bash` = unrestricted" cell
> (`src/core/effects.ts`) with a sharper trichotomy: decidably-read-only · decidably-effecting ·
> undecidable→conservative — the sandbox staying the runtime backstop.** Companion to
> `side-effect-separation.md` (the purity ladder + the `Bash` hole this refines),
> `harness-state-space.md` (make the state space measurable), `docs/safety.md` (the sandbox).

## Lead with the framing: a decidable subset, not full decidability

Be honest up front. "Classify an arbitrary `Bash` command string by effect" is, in full
generality, **undecidable** — the command that actually runs can depend on runtime values
(`$CMD`, `$(…)`, `eval`), and "does program _P_ have effect _E_" is a non-trivial semantic
property of _P_'s behaviour (Rice's theorem). So the honest claim is **not** "we classify every
`Bash`." It is: **the space of command strings splits into a large, statically-classifiable
DECIDABLE subset and a smaller genuinely-undecidable residue, and a deterministic classifier can
be PRECISE on the former and CONSERVATIVE (fail-closed to side-effecting) on the latter.** That
is exactly the property the maintainer wants — a no-LLM verdict that is **never wrong in the
unsafe direction** (it may over-block `ls`; it must never call `rm -rf` read-only).

The asymmetry of acceptable error is the whole design constraint:

- **False "effecting" on a read-only command** (calls `git status` an effect) — acceptable.
  Conservative, annoying, the don't-cry-wolf cost we already pay.
- **False "read-only" on a destructive command** (calls `rm -rf /` read-only) — **unacceptable.**
  A single such miss makes the classifier worse than useless.

So the classifier is **fail-closed by construction**: anything it cannot _prove_ read-only is
declared side-effecting. The decidable subset is "the set of commands we can prove read-only,"
not "the set we can parse."

## The decidable substrate — a shell AST parser

You cannot classify by string-matching the command text (the brittle path: `grep -q 'rm '`
misses `/bin/rm`, `r''m`, `rm` after a `;`, and false-positives on `confirm`). The deterministic
substrate is a **real shell parser** that yields an AST: command heads, arguments, **redirections**
(`>`/`>>`/`tee` are writes regardless of the command), pipes, subshells, and `&&`/`||`/`;`
sequencing. From the AST you classify _structurally_, not lexically.

### What an AST gives you cleanly

- **Command heads + args** — the dispatch key for the catalog (`rm`, `git`, `find`), and the
  flags that flip a command's effect (`sed -i`, `find -delete`).
- **Redirections** — `>` (`RdrOut`), `>>` (`AppOut`), `>|` (`RdrClob`) are **writes to the
  named file**, independent of the command. `cat x > y` is a write even though `cat` is
  read-only. The parser surfaces these as first-class nodes (mvdan/sh enumerates `RdrOut`,
  `AppOut`, `RdrClob`, `Hdoc`, `DplOut`, …), so "any output redirection ⇒ write effect" is a
  one-line structural rule — the single highest-value thing the AST buys over string-matching.
- **Sequencing / lists** — `a && b ; c | d` decomposes into per-command nodes; the command's
  effect is the **union** of every leaf's effect (a list is read-only iff _all_ leaves are).
- **Subshells / groupings** — `( … )`, `{ …; }` recurse the same way.
- **The dangerous nodes named explicitly** — `eval`, command substitution (`CmdSubst`),
  process substitution, here-docs — which is precisely how we _detect the residue_ to
  fail-closed on it (see below). The parser doesn't resolve them; it makes them visible.

### Parser comparison

| Parser               | Lang                        | AST quality                                                         | Redirections                                                             | Fitness for vigiles                                                                                                                                                                          |
| -------------------- | --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`mvdan/sh`**       | Go                          | **Gold standard** — full bash/POSIX/mksh AST (powers shfmt)         | ✅ enumerated typed nodes (`RdrOut`/`AppOut`/`RdrClob`/`Hdoc`/`DplOut`…) | **Best.** Battle-tested, exhaustive node types, `syntax.Walk`. Pure Go — but **`mvdan-sh` is published to npm** (GopherJS build), so reachable from vigiles's Node CLI without a Go runtime. |
| **tree-sitter-bash** | C (Rust/Node/WASM bindings) | Concrete syntax tree, robust + error-tolerant; S-expression queries | ✅ `file_redirect`/`heredoc_redirect` nodes                              | Strong alt. WASM/Node bindings, no native toolchain needed; CST is noisier than mvdan's typed AST but query-able. Good if a native dep is unwanted.                                          |
| **bashlex**          | Python                      | Good — handles command/process substitution                         | ✅                                                                       | Python-only — out of process for a Node CLI; fine as a reference for residue cases.                                                                                                          |
| **bash-parser**      | JS                          | Pure-JS POSIX AST                                                   | ✅                                                                       | Native-JS convenience, but less maintained / less bash-complete than mvdan; viable for a zero-native-dep first cut.                                                                          |
| **libdash / morbig** | OCaml                       | **Formal** POSIX parser (academic, provably-faithful grammar)       | ✅                                                                       | The rigor reference (Morbig is a _correct_ POSIX parser); too heavy a dep to ship, but the citation that "shell is parseable, just not statically _resolvable_."                             |

**Recommendation: `mvdan/sh` semantics** (via the `mvdan-sh` npm package, or shelling to a small
Go helper), with **tree-sitter-bash** as the no-native-Go fallback. Both give typed redirection
nodes and a walkable tree — everything the classifier needs.

## The command-effect catalog

With heads + flags + redirections in hand, classify each leaf command against a **static
catalog** mapping `(command, flags) → effect set`. The effect vocabulary matches the granular
classes the question asks for: **read · write · delete · network · exec/spawn · proc-control**.

### A starter catalog (the common subset)

| Class           | Read-only (prove-safe)                                                                                                                                                                                          | Side-effecting                                                                                               | Flag-sensitive (the interesting cases)                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| files           | `cat ls grep egrep fgrep head tail wc stat file find(no -delete/-exec/-execdir) sort(no -o) cut awk(no redirect) tr sed(no -i) diff cmp realpath dirname basename echo printf test [ pwd date env(print) du df` | `rm mv cp dd tee truncate install mkdir rmdir touch ln chmod chown ln tar -x unzip ar`                       | `sed` → `-i` writes; `find` → `-delete`/`-exec`/`-execdir`/`-fprint` effect, else read; `sort` → `-o FILE` writes; `tar` → `-x` write vs `-t`/`-tf` read; `cp/mv/rm` always write/delete |
| git             | `git status log diff show blame branch(list) rev-parse describe ls-files cat-file config(--get) remote(-v) tag(list, no args) stash list`                                                                       | `git push commit add rm mv tag(create) checkout reset merge rebase clean fetch pull apply am stash(push) gc` | `git` effect is **subcommand-keyed** (not command-keyed); `git tag` lists (read) vs `git tag X` creates (write); `git config --get` reads vs `git config k v` writes                     |
| package / build | `npm ls/view/outdated`, `pip show/list`, `cargo tree`, `go list`                                                                                                                                                | `npm install/ci/publish`, `pip install`, `cargo build/install`, `make`, `go build/install`                   | most installers also **network** + **write** + **exec** (run lifecycle scripts) — triple-effect                                                                                          |
| network         | —                                                                                                                                                                                                               | `curl wget ssh scp rsync nc telnet ftp ping dig host`                                                        | `curl`/`wget` to a file also **write**; almost never prove-safe                                                                                                                          |
| exec / spawn    | —                                                                                                                                                                                                               | `sh bash zsh xargs env python python3 node perl ruby awk(prog) gcc make sudo nohup`                          | these **dispatch arbitrary code** → residue (see below), not catalogued as a fixed effect                                                                                                |
| process-control | `ps top(batch)`                                                                                                                                                                                                 | `kill pkill killall nice renice systemctl service nohup disown trap` (job/proc control)                      | `kill -0` is a read (existence probe) vs `kill -9` signals                                                                                                                               |

### Is the catalog big/maintainable?

Smaller than it looks. Empirically, agent `Bash` calls cluster on a **short head**: `git`,
`npm`/`pnpm`/`yarn`, `ls`/`cat`/`grep`/`find`/`rg`, `sed`/`awk`, `python`/`node`, `mkdir`/`rm`/
`mv`/`cp`, `curl`/`wget`, `echo`, `test`. A **~50–80 command catalog with subcommand tables for
`git`/`npm`/`docker`/`kubectl`** covers the overwhelming majority of real traffic. Crucially,
**the catalog only needs to enumerate the read-only / prove-safe side** carefully — the
fail-closed default means an _unknown_ command is already correctly handled (→ side-effecting).
So maintenance burden = "keep the read-only allowlist accurate," and a wrong omission there is
**safe** (over-blocks), never unsafe. The default-deny posture makes the catalog
**append-mostly** and forgiving.

### Prior art for command allow/deny catalogs

This is a well-trodden pattern — vigiles is assembling, not inventing:

- **Claude Code's own permission rules** match the **literal command string** with prefix/glob
  patterns (`Bash(npm:*)`, word-boundary aware), and — notably — are **shell-operator-aware**:
  `Bash(safe-cmd *)` does **not** match `safe-cmd && malicious-cmd`. That's a (coarse) AST-ish
  decomposition already, and confirms the deterministic path is the harness's _own_ fallback
  posture; the LLM classifier is the convenience layer on top, not the floor.
- **sudoers / `Cmnd_Alias`** — decades-old command allowlists keyed on path + args.
- **firejail / AppArmor / SELinux profiles** — per-binary capability profiles (read these
  paths, no net). The AppArmor model ("this binary may touch these resources") is the catalog's
  resource view; the difference is profiles are _per-binary at runtime_, the catalog is
  _per-command-string at classify-time_.
- **OpenBSD `pledge`/`unveil`** — a program declares its own effect classes; the catalog is the
  third-party version of the same taxonomy.

## The genuinely-undecidable residue (be precise)

These constructs defeat static classification **soundly** — for each, the command that actually
runs (and thus its effect) is **not determined by the string**. The classifier must detect each
syntactically and **fail-closed to side-effecting**:

1. **`eval STRING`** — runs a string as a command. The string is built at runtime
   (`eval "$x"`); its identity is unknown statically. _Undecidable_ (this is the canonical
   Rice-theorem case — the effect is a property of a value computed at runtime).
2. **Command substitution `$(…)` / backticks producing the command** —
   `$(get-cmd) foo`, `` `which thing` ``. The head itself is the _output of another command_,
   unknown until run.
3. **Variable-expanded command names** — `$CMD foo`, `${TOOL} bar`. The head is a variable; what
   `$CMD` _is_ depends on the environment at runtime. Statically the head is unresolvable.
4. **Nested interpreters with a string program** — `sh -c "…"`, `bash -c "…"`, `xargs <cmd>`,
   `env VAR=x <cmd>`, `nohup <cmd>`, `timeout 5 <cmd>`, `sudo <cmd>`. Here the _real_ command is
   an **argument**. Two sub-cases: (a) **statically-present** inner string (`sh -c "rm x"`) —
   one could **recurse** the classifier into the inner string (a bounded, sound refinement —
   parse the literal, classify it); (b) **dynamic** inner string (`sh -c "$x"`) — undecidable,
   fail-closed. Arbitrary nesting depth, so recursion must bound and then fail-closed.
5. **Arbitrary interpreters with inline programs** — `python -c "…"`, `node -e "…"`,
   `perl -e "…"`, `ruby -e "…"`, `awk 'BEGIN{print > "f"}'`. The program is in a foreign
   language with its **own** file/network/exec effects, possibly _inside a single string arg_
   (the awk redirect writes a file the shell AST never sees). Classifying these would mean
   embedding a Python/Node/Perl/awk effect analyzer — out of scope; **fail-closed**.
6. **Pipe into a shell** — `curl … | sh`, `… | bash`. The piped-in text is fetched at runtime;
   classic supply-chain shape; undecidable + obviously effecting.
7. **Aliases / shell functions / PATH resolution** — what `foo` _is_ depends on aliases,
   functions defined earlier, and `$PATH` order. The same head can be a different program in a
   different environment. (Mitigated in practice because agent `Bash` calls usually run in a
   fresh non-interactive shell with no rc, but **soundly** it's environment-dependent.)
8. **Here-docs feeding an interpreter** — `python <<'EOF' … EOF`, `cat <<EOF > file` — the
   body is a program/payload; for an interpreter head it's residue, though `cat <<EOF > f` is
   _decidably_ a write (the redirection is visible).

**Why undecidable, honestly:** cases 1–3, 6 turn on **command identity computed at runtime**
(you'd have to evaluate the program to know what runs — Rice's theorem: any non-trivial property
of program behaviour is undecidable). Cases 4b, 5, 8 turn on **effects expressed in a nested
language** the shell AST doesn't reach. Case 7 turns on **environment-dependent name
resolution**. None of these is a tooling gap that a better parser closes — they are the genuine
residue. The correct response is not to guess; it is to **detect the construct and fail-closed**,
which is always sound.

## The other camp — runtime enforcement instead of static parsing

The honest counter-position: **"stop trying to parse it; confine it."** Instead of deciding the
effect from the string ahead of time, run the command inside a box that _physically cannot_
exceed an effect budget, and let the kernel be the oracle. This gives a **sound** effect
guarantee with **zero** parsing — at the cost of deciding **at runtime, post-hoc**, and
**confining rather than classifying**.

| Mechanism                                              | Guarantee                                                                                                                                                            | Tradeoff for vigiles                                                                                                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **bubblewrap / firejail** (vigiles already uses bwrap) | namespaces: read-only `/`, no egress, throwaway writable dir, cleared env                                                                                            | Runtime, coarse-but-sound. **This is vigiles's real `Bash` guarantee today** — the sandbox, not a classifier.                                                                                              |
| **Landlock** (Linux LSM)                               | per-process **filesystem + network** access control, unprivileged, irreversible once set                                                                             | Sound, fine-grained ("may write only here, no net"). Runtime; Linux-only; doesn't tell you _beforehand_ what a string will do.                                                                             |
| **seccomp-bpf**                                        | syscall filtering (block `connect`, `unlink`, …)                                                                                                                     | Sound at the syscall layer, but **can't deref pointers** — can't tell `open("/etc/passwd")` from `open("./scratch")`; pair with Landlock for path semantics.                                               |
| **gVisor**                                             | user-space kernel, intercepts all syscalls                                                                                                                           | Strongest isolation; heavier; same post-hoc-confinement nature.                                                                                                                                            |
| **Shill** (Harvard, OSDI'14)                           | a **capability-based shell**: scripts carry _contracts_ limiting their effects **and the effects of programs they invoke**, enforced by language design + sandboxing | The research north star — exactly "declared-vs-enforced effects for shell." But it's a _new shell/language_, not a classifier for arbitrary bash strings; cite as the principled end-state, not a drop-in. |

**The key distinction for vigiles's two needs.** vigiles has **two different questions**, and the
two camps answer different ones:

- **The runtime guarantee** ("this `Bash` call will not actually escape its budget") — **belongs
  to the sandbox.** Static parsing can _never_ be the safety floor here, because the residue is
  real; bwrap/Landlock already provide the sound runtime answer, and `docs/safety.md` is correct
  that "the real guarantee for `Bash` is the sandbox." Static classification does **not** replace
  it.
- **The author/compile-time SURFACE number** ("how effecting is this skill's `Bash` usage,
  statically, for `effectSurface`/`scan`/the leaderboard") — **needs static classification**,
  because there's nothing to confine yet (no process runs at compile time). The sandbox can't
  give you a number on a `.spec.ts`. This is the gap static classification fills.

So the two are **complementary, not competing**: static classify for the **measure**, sandbox for
the **guarantee**.

## The recommended two-tier deterministic design

A single deterministic function, **no model**, fail-closed:

```
classifyBashEffect(command: string): EffectVerdict
  = "read-only"        // proven: every leaf head ∈ read-only catalog, no write redirection, no residue node
  | { effecting: Set<EffectClass> }   // write|delete|network|exec|proc-control, from the catalog + redirections
  | "undecidable"      // residue detected → treated as unrestricted (fail-closed)
```

**Tier A — the high-precision decidable path:**

1. Parse with `mvdan/sh` (or tree-sitter-bash). On **parse error → undecidable** (fail-closed).
2. **Walk the AST.** If **any** node is a residue construct (`eval`, `CmdSubst` as a head,
   variable-expanded head, `sh -c`/`bash -c`/`xargs`/`python -c`/… with a dynamic or
   non-recursable inner string, pipe-into-shell, here-doc to an interpreter) → **undecidable**.
   _(Refinement: for a `sh -c "LITERAL"` with a fully static inner string, recurse the classifier
   into the literal — sound, and it rescues a common wrapper case. Bound the depth, then
   fail-closed.)_
3. **Any output redirection** (`>`, `>>`, `>|`, `tee` target) on **any** leaf → add **write**
   (and never read-only), regardless of the command.
4. **Catalog-lookup each leaf head** (+ subcommand for `git`/`npm`/… + flag table). Union the
   effect classes across all leaves of the list/pipe.
5. **Verdict:** empty union + no residue + no write redirection ⇒ **read-only**; else the union
   is the **effecting** set.

**Tier B — fail-closed default:** unknown head, unparsed, or any residue ⇒ **undecidable →
unrestricted**. Never guess read-only.

### Precision / recall expectations

- **On the unsafe direction (the one that matters): targeting zero false-read-only.** Soundness
  holds _by construction_ — the only way to get "read-only" is to clear an explicit allowlist
  with no write redirection and no residue. The residual risk is a **catalog error** (mislabeling
  a truly-effecting command read-only, e.g. forgetting `git config k v` writes); these are bugs
  to be tested out, and the subcommand/flag tables are exactly the test surface
  (`git`/`find`/`sed`/`tar`/`sort` are the known traps).
- **Recall (how much of real traffic gets a _precise_ verdict vs the conservative
  "undecidable"):** high on the common subset (`git status`, `ls`, `grep`, `cat`, `find` reads,
  `npm ls`), low on dynamic/interpreter-heavy commands (correctly, since those _are_ the
  residue). Over-blocking is acceptable; the metric to watch is "what % of read-only commands do
  we _recognize_ as read-only," which the catalog drives up incrementally.

### How it refines `effectSurface` (`src/core/effects.ts`)

Today `effects.ts` classifies any contract holding `Bash` as **unrestricted** — the single
unbounded cell, because `Bash(git status)` and `Bash(rm -rf)` are one tool name. With a
deterministic per-command classifier, the surface analysis can look **inside** the `Bash`
restriction strings and the skill's documented commands:

- A skill whose `Bash` usage is provably read-only (e.g. constrained via `Bash(git status:*)`,
  `Bash(ls:*)`, `Bash(grep:*)`) drops from **unrestricted** to **bounded** (or even contributes
  toward **pure**-adjacent) — sharpening `side-effect-separation.md`'s purity ladder, whose
  "honest hole" is precisely this `Bash` catch-all.
- The leaderboard / blast-radius map gains a **granular capability column** (this skill's `Bash`
  touches write+network) instead of a flat "unrestricted," making the harness-state-space
  **measure** finer-grained — `harness-state-space.md`'s "make the state space measurable" applied
  to the one cell that was unmeasurable.
- It stays a **surface** claim, not a runtime claim: the verdict refines the static number; the
  sandbox still owns the runtime guarantee (no overclaim).

> **Implementation calibration (2026-06-20, after shipping `src/core/bash-effects.ts`).** The
> STATIC refinement above is real but **modest**, and the classifier's PRIMARY home is the
> **runtime gate** — which is now WIRED. `isReadOnlyBash` is reached by `decidePurityGate`
> (`src/core/effects.ts`), folded into the Claude Code agent `PreToolUse` rail
> (`src/adapters/claude-code/agent-runtime.ts`): the `PreToolUse` hook sees the REAL command
> string, so a `bounded` agent's `git status` is **allowed** as observation and `git push` is
> **denied** at the live call. Why this, and not `effectSurface`: `effectSurface` sees a tool
> _name_ + permission _pattern_ from the declared contract (`Bash(git:*)`), **not an actual
> command** — and a broad restriction like `Bash(git:*)` still permits `git push`, so it correctly
> stays _effecting_; only a `Bash(<concrete read-only command>)` (e.g. `Bash(git status:*)`) is
> statically downgradable, the minority of real contracts. So the STATIC `effectSurface`/`scan`
> still treats `Bash` as `unrestricted` (it can't see the command); the runtime gate is where the
> refinement lands, and the static-`effectSurface` refinement stays a small bonus for
> concrete-restriction contracts.

### How it composes with the sandbox

Two layers, two jobs (the same defense-in-depth `side-effect-separation.md` already advocates):

- **Static classifier → the compile/scan/surface number** and an _optional_ early signal in a
  `PreToolUse` lint (advisory). Cheap, no model, runs on every commit.
- **Sandbox (bwrap/Landlock) → the runtime guarantee.** The classifier's "undecidable" cell is
  exactly where the sandbox earns its keep: vigiles never _trusts_ a static read-only verdict to
  skip confinement of foreign code; it uses the verdict to _describe_ and to _tighten an
  allowlist_, and lets the kernel enforce.

## Honest bottom line

**Full decidability is impossible** — `eval`, dynamic command names, command substitution,
piped-in shell, nested interpreters, and environment-dependent name resolution are a genuine
undecidable residue (Rice's theorem + runtime-dependent command identity), not a tooling gap.
**But that does not block the maintainer's goal.** A deterministic, no-LLM classifier built on a
real shell AST (`mvdan/sh`) plus a ~50–80-command read-only catalog (with subcommand/flag tables
for `git`/`find`/`sed`/`tar`/`sort`) **is sound by construction** — it declares "read-only" only
when it can prove it, treats output redirections as writes structurally, and **fail-closes every
residue construct to side-effecting**. Net: vigiles can drop the blanket **"all `Bash` =
unrestricted"** for a sharper **trichotomy** — _decidably-read-only · decidably-effecting (with
granular write/delete/network/exec/proc-control classes) · undecidable→conservative_ — with the
**sandbox as the unchanged runtime backstop**. This is the no-LLM answer, with its limits named:
it sharpens the **static surface measure**; it does **not** and **must not** claim to be the
runtime safety guarantee (that stays the sandbox), and it will over-block the residue on purpose.

### Smallest first step

Ship an `mvdan/sh`-based (via the `mvdan-sh` npm package — no Go toolchain) classifier that does
exactly three things, fail-closed: (1) parse → on error, `undecidable`; (2) flag any residue node
(`eval`, dynamic head, `sh -c`/interpreter `-c`/`-e`, pipe-to-shell) → `undecidable`; (3) for the
clean case, union the catalog effect of each leaf head **plus** "any output redirection ⇒ write."
Seed the catalog with the ~30 highest-frequency heads (`git`+subcommands, `ls cat grep find head
tail wc stat sed awk sort rm mv cp mkdir touch tee npm curl wget echo test`). Wire it as a pure
detector reused by `effects.ts` (the per-`Bash` lookup that turns the unbounded cell into a
graded one) and by `scan` — **one detector, no drift** — with a dogfood test over a fixture of
real read-only vs destructive vs residue commands asserting **zero false-read-only**. That is one
pure module + a fixture; the surface payoff (a graded `Bash` column on the leaderboard) lands
immediately, and the sandbox keeps the runtime guarantee untouched.

## See also

- `side-effect-separation.md` — the purity ladder (pure/bounded/unrestricted) and the "Honest
  limits" `Bash` hole this doc refines; the deterministic capability gate + sandbox composition.
- `harness-state-space.md` — the effect-system / declared-vs-observed bet and "make the state
  space measurable"; this is the `Bash` cell of that measure made granular.
- `docs/safety.md` — the bubblewrap/Seatbelt sandbox that is, and remains, the runtime guarantee
  for `Bash`/subprocess effects (static classification refines the measure, never replaces it).
- `src/core/effects.ts` — `effectSurface`, the consumer that would gain the per-`Bash` lookup.

### Sources

- [mvdan/sh — shell parser/formatter/interpreter (shfmt)](https://github.com/mvdan/sh) ·
  [syntax package docs (redirection node types)](https://pkg.go.dev/mvdan.cc/sh/v3/syntax) ·
  [mvdan-sh on npm](https://www.npmjs.com/package/mvdan-sh)
- [tree-sitter-bash grammar](https://github.com/tree-sitter/tree-sitter-bash) ·
  [bashlex (Python)](https://github.com/idank/bashlex)
- [ShellCheck (static-analysis limits: can't follow runtime values / `eval`)](https://github.com/koalaman/shellcheck) ·
  [SC2294 — `eval` negates analysis](https://www.shellcheck.net/wiki/SC2294)
- [Landlock — unprivileged filesystem+network access control](https://docs.kernel.org/userspace-api/landlock.html) ·
  [Landlock vs seccomp complementarity (LWN)](https://lwn.net/Articles/792057/)
- [SHILL: A Secure Shell Scripting Language (OSDI '14)](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-moore.pdf)
- [Claude Code — Configure permissions (literal-string + shell-operator-aware matching)](https://code.claude.com/docs/en/permissions)
