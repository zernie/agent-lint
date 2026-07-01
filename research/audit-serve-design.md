---
status: idea
topic: audit
---

# `audit --serve` — the one-click-local adoption server (design + security)

> Internal design record (2026-06-28). `audit`'s HTML report is a static file, so
> its "Create spec" buttons can only COPY the `npx vigiles init …` command. The
> founder asked for one-click adoption from the report; this is how it's done
> safely. Companion to `audit-adoption-ux.md` (which first deferred `--serve`) and
> `harness-checkup-and-lanes.md` (the read-vs-run safety axis).

## The problem & why a flag, not the default

A browser can't write your repo or run a command. So a _static_ report's buttons
copy a command; a _live_ report needs a local server the browser POSTs to. We make
`--serve` opt-in (not the `audit` default) because serving flips audit from a
**terminating, headless-safe, shareable read** into a **long-running interactive
write-server** — and the read is audit's identity:

- it **runs and exits** (the common "show me the rings" case must not hang);
- it's called **headless** (agents, `--json`, pipes) — a server that waits for a
  browser would hang those (note: NOT a CI concern — `audit` isn't a CI step,
  `lint` is);
- the **static file is shareable**; a server is ephemeral/local.

So `--serve` gates a different MODE. The gate is **option B** (`decideServeGate`):
`--no-serve`/foreign-repo/`--json`/headless → skip; `--serve` → force; a TTY with
adoptable surfaces → **ask once** ("open the live report?"), reusing audit's
existing "ask-once-at-a-TTY" pattern. No mandatory flag; safe defaults preserved.

## Prior art (what comparable tools do)

Surveyed before building (see the chat record / `prefer-existing-solutions`):

- **Lighthouse / Swagger UI** — pure report, fix elsewhere. (= audit's static core.)
- **shadcn/ui, `npx create-*`** — copy-a-command. (= audit's static buttons.)
- **Jupyter, Prisma Studio, Vite/Vitest UI** — a localhost backend the browser
  talks to. Jupyter is the **gold-standard hardening**: bind localhost + a
  per-session **token** (printed to the terminal, sets a cookie) + **XSRF
  cookie/header + Origin checks** (shipped for CVE-2016-9971). Prisma Studio is the
  light end — a localhost UI that reads/**writes your real DB** with minimal
  ceremony, justified by "dev-only, your own DB."
- **Nx Console, SonarLint** — an **editor extension** sidesteps the browser/CSRF
  surface entirely (the editor is the trusted local actor). The cleaner path if we
  ever do an IDE integration — noted, not built.
- **Dependabot, Renovate, Snyk, CodeRabbit** — a **hosted** service can't touch
  local files, so it acts via a **GitHub App that opens a PR**. This is the only
  model for a future hosted vigiles dashboard ("adopt for me" = PR, never local
  write).

vigiles's blast radius is **lower than Prisma's** (a reversible local `.spec.ts`
write — no exec, no net, no model; `eject` undoes it), so the Jupyter recipe is
belt-and-suspenders, not strictly required — but we apply it anyway since it's cheap.

## The security model (implemented in `src/audit-serve.ts`)

1. **Bind `127.0.0.1` only** (never `0.0.0.0`) — unreachable off the machine.
2. **Per-run crypto token** (`newToken`, 16 random bytes) embedded in the served
   HTML (`window.__VIGILES_SERVE__`) and **required on every mutating POST**
   (`X-Vigiles-Token`). A foreign site can't read the token (CORS blocks reading a
   cross-origin GET body), so it can't forge a POST — the **primary CSRF defense**.
   Constant-time compare (`tokenOk` via `timingSafeEqual`).
3. **Origin check** (`originOk`) — a POST's `Origin` must be the loopback server
   (belt-and-suspenders over the token).
4. **Allowlist, not paths** (`resolveSurface`) — a POST names a surface; it's
   resolved against the pre-computed adoptable set, so a forged/traversal path
   (`../../etc/x`) is refused (400). Never trusts a raw client path.
5. **In-process `init`** — `runAdopt` calls `scaffoldSpec(["--target="+t])`
   directly; never a shell → no command injection.
6. **Own-repo only** — `decideServeGate` skips serve when the audited dir isn't the
   cwd (specs write into the current repo via `scaffoldSpec`), even with `--serve`.
7. **Ephemeral** — the server runs only while the user has it open; `/shutdown`
   (the page's Done) or SIGINT stops it.

The pure decision logic (`decideServe`, `tokenOk`, `originOk`, `resolveSurface`,
`decideServeGate`) is unit-tested; a **real-HTTP end-to-end** test drives the
server over `fetch` (forged POST → 403, valid → adopt runs, traversal → 400,
shutdown ends it). The http/IO shell (`serveAudit`) is the thin v8-ignored wrapper.

This reverses the earlier "audit reads; NO execution flag" decision of record —
done deliberately on the founder's call, scoped tightly (own-repo, interactive,
token-guarded, low blast radius) so the plain `audit` stays a safe read.

## Deferred / future

- **`audit --serve` for a foreign repo** — would need `scaffoldSpec` to take a
  target root; today it writes into cwd, so serve is own-repo only.
- **Editor extension** — the surface-free alternative (Nx Console model).
- **Hosted "adopt for me"** — the GitHub-App→PR model (Dependabot/Renovate), the
  only way a remote dashboard can act on a repo.
