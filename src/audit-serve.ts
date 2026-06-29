/**
 * `audit --serve` — the optional one-click-local adoption server.
 *
 * The HTML audit report is a STATIC file: a browser can't write your repo, so by
 * default its "Create spec" buttons just COPY the `npx vigiles init …` command.
 * `--serve` (or the TTY prompt) instead starts a tiny LOCAL server the report
 * POSTs to, so a button click actually runs `init` for you — without ever leaving
 * your machine.
 *
 * This is the only path where `audit` WRITES via a button, so it carries the
 * standard localhost-server hardening (the Jupyter recipe — see
 * research/audit-serve-design.md):
 *
 *   1. BIND 127.0.0.1 only (never 0.0.0.0) — unreachable off the machine.
 *   2. A per-run SECRET TOKEN (crypto-random), embedded in the served HTML and
 *      REQUIRED on every mutating POST. A foreign website can't read the token
 *      (CORS blocks reading a cross-origin GET body), so it can't forge a POST —
 *      this is the primary CSRF defense.
 *   3. ORIGIN/Host check as belt-and-suspenders: a POST's Origin must be the
 *      loopback server itself.
 *   4. The adopt endpoint takes a surface ID from the pre-computed ALLOWLIST (the
 *      surfaces audit already discovered), never a client-supplied path — so a
 *      forged request can't traverse outside the repo.
 *   5. The action calls `init` IN-PROCESS (an injected runner), never a shell, so
 *      there's no command injection.
 *   6. Worst-case blast radius is tiny: `init` writes a reversible local
 *      `.spec.ts` (no exec, no network, no model); `eject` undoes it.
 *
 * The pure decision logic (`decideServe`, `tokenOk`, `originOk`,
 * `resolveSurface`) is unit-tested; the http/IO shell (`serveAudit`) is the thin
 * v8-ignored wrapper.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

/** A per-run server session: the secret token + the adopt allowlist. */
export interface ServeSession {
  /** Crypto-random hex; embedded in the HTML, required on every mutating POST. */
  readonly token: string;
  /** The loopback port the server is bound to (for the Origin check). */
  readonly port: number;
  /**
   * The adoptable surfaces, keyed by their repo-relative path. A POST names a
   * path; we resolve it HERE against this set, so an off-list path is refused.
   */
  readonly surfaces: ReadonlySet<string>;
}

/** The salient, transport-agnostic fields of an incoming request. */
export interface RequestView {
  readonly method: string;
  /** The URL path (no query string). */
  readonly path: string;
  /** The `X-Vigiles-Token` header, if any. */
  readonly token: string | null;
  /** The `Origin` header, if any. */
  readonly origin: string | null;
  /** `body.target` for an adopt POST, if any. */
  readonly target: string | null;
}

/** What the server should do with a request — a pure, testable verdict. */
export type ServeDecision =
  | { readonly kind: "report" }
  | { readonly kind: "adopt"; readonly target: string }
  | { readonly kind: "adopt-all" }
  | { readonly kind: "shutdown" }
  | {
      readonly kind: "reject";
      readonly status: number;
      readonly reason: string;
    };

/**
 * Constant-time token comparison (avoids a timing side-channel). Returns false
 * for a missing/short token rather than throwing.
 */
export function tokenOk(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Lengths are equal here, so timingSafeEqual is safe to call.
  return timingSafeEqual(a, b);
}

/**
 * A mutating POST's Origin must be the loopback server itself (or absent — some
 * same-origin fetches omit it, and the token already guards those). A foreign
 * site's Origin never matches, so a cross-site POST is refused even before the
 * token check.
 */
export function originOk(origin: string | null, port: number): boolean {
  if (origin === null) return true; // rely on the token (a foreign site can't have it)
  return (
    origin === `http://127.0.0.1:${String(port)}` ||
    origin === `http://localhost:${String(port)}`
  );
}

/**
 * Resolve a client-supplied surface path against the allowlist. Returns the path
 * only if it's a known adoptable surface — never trusts a raw path (no traversal).
 */
export function resolveSurface(
  target: string | null,
  surfaces: ReadonlySet<string>,
): string | null {
  if (!target) return null;
  return surfaces.has(target) ? target : null;
}

/**
 * The pure router: given a request and the session, decide what to do. Every
 * MUTATING route (adopt / adopt-all / shutdown) requires POST + a valid Origin +
 * a valid token; GET / serves the report page (its body is CORS-protected, so a
 * foreign site can't read it even if it requests it).
 */
export function decideServe(
  req: RequestView,
  session: ServeSession,
): ServeDecision {
  if (
    req.method === "GET" &&
    (req.path === "/" || req.path === "/index.html")
  ) {
    return { kind: "report" };
  }
  const mutating =
    req.path === "/adopt" ||
    req.path === "/adopt-all" ||
    req.path === "/shutdown";
  if (!mutating) {
    return { kind: "reject", status: 404, reason: "not found" };
  }
  if (req.method !== "POST") {
    return { kind: "reject", status: 405, reason: "method not allowed" };
  }
  if (!originOk(req.origin, session.port)) {
    return { kind: "reject", status: 403, reason: "bad origin" };
  }
  if (!tokenOk(req.token, session.token)) {
    return { kind: "reject", status: 403, reason: "bad or missing token" };
  }
  if (req.path === "/shutdown") return { kind: "shutdown" };
  if (req.path === "/adopt-all") return { kind: "adopt-all" };
  const target = resolveSurface(req.target, session.surfaces);
  if (!target) {
    return { kind: "reject", status: 400, reason: "unknown surface" };
  }
  return { kind: "adopt", target };
}

/** A fresh crypto-random session token (32 hex chars = 16 bytes). */
export function newToken(): string {
  return randomBytes(16).toString("hex");
}

/** Whether `audit` should start the live adoption server. */
export type ServeGate = "serve" | "skip" | "ask";

/**
 * The pure serve-gate decision (option B). A plain `audit` stays a terminating,
 * headless-safe read; the live server is only ever offered/started INTERACTIVELY
 * and OWN-REPO (it writes specs — never into a stranger's dir):
 *   - `--no-serve`, a foreign repo, or `--json`/headless → skip (never serve).
 *   - `--serve` → serve (force, skip the prompt).
 *   - a TTY with adoptable surfaces → ask once ("open the live report?").
 *   - a TTY with nothing to adopt → skip (no point).
 */
export function decideServeGate(o: {
  serveFlag: boolean;
  noServeFlag: boolean;
  json: boolean;
  isTTY: boolean;
  ownRepo: boolean;
  adoptableCount: number;
}): ServeGate {
  if (o.noServeFlag) return "skip";
  if (!o.ownRepo) return "skip"; // serve writes specs → own repo only
  if (o.serveFlag) return "serve";
  if (o.json || !o.isTTY) return "skip"; // headless never serves
  if (o.adoptableCount === 0) return "skip"; // nothing to adopt
  return "ask";
}

/** The outcome of running an adopt action, reported back to the report UI. */
export interface AdoptOutcome {
  readonly ok: boolean;
  readonly message: string;
}

export interface ServeOptions {
  /** The per-run secret token (already injected into `html`). */
  readonly token: string;
  /** The adopt allowlist (repo-relative surface paths). */
  readonly surfaces: ReadonlySet<string>;
  /** The rendered report HTML (with the token already injected). */
  readonly html: string;
  /** Adopt ONE surface (the CLI passes a closure over `init --target=`). */
  readonly runAdopt: (target: string) => Promise<AdoptOutcome>;
  /** Adopt every surface (bare `init`). */
  readonly runAdoptAll: () => Promise<AdoptOutcome>;
  /** Called once the server is listening, with the URL to open. */
  readonly onListening?: (url: string) => void;
}

/* v8 ignore start — the http/IO shell; the decision logic above is unit-tested. */

/** Read a request body to a string, capped to avoid an unbounded read. */
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) break; // an adopt POST is tiny; cap defensively
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function viewOf(req: IncomingMessage, body: string): RequestView {
  const path = (req.url ?? "/").split("?")[0];
  let target: string | null = null;
  try {
    if (body) target = (JSON.parse(body) as { target?: string }).target ?? null;
  } catch {
    target = null;
  }
  const header = (n: string): string | null => {
    const v = req.headers[n];
    return typeof v === "string" ? v : null;
  };
  return {
    method: req.method ?? "GET",
    path,
    token: header("x-vigiles-token"),
    origin: header("origin"),
    target,
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    // No CORS headers: same-origin only. A cross-origin site can fire a request
    // but cannot read this response — and can't forge the token anyway.
    "x-content-type-options": "nosniff",
  });
  res.end(payload);
}

/**
 * Start the loopback adoption server. Resolves when the server shuts down (via
 * the /shutdown route or SIGINT). Bound to 127.0.0.1 only.
 */
export async function serveAudit(opts: ServeOptions): Promise<void> {
  const { token, surfaces, html, runAdopt, runAdoptAll, onListening } = opts;
  // The bound port is known only after listen(); the request handler reads it via
  // this closure. No request can arrive before the server is listening, so the
  // late assignment is race-free.
  let session: ServeSession = { token, port: 0, surfaces };
  await new Promise<void>((resolveServer) => {
    const server = createServer((req, res) => {
      void (async () => {
        const body = req.method === "POST" ? await readBody(req) : "";
        const decision = decideServe(viewOf(req, body), session);
        switch (decision.kind) {
          case "report":
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(html);
            return;
          case "adopt": {
            const out = await runAdopt(decision.target);
            sendJson(res, out.ok ? 200 : 500, out);
            return;
          }
          case "adopt-all": {
            const out = await runAdoptAll();
            sendJson(res, out.ok ? 200 : 500, out);
            return;
          }
          case "shutdown":
            sendJson(res, 200, { ok: true, message: "shutting down" });
            server.close(() => {
              resolveServer();
            });
            return;
          case "reject":
            sendJson(res, decision.status, {
              ok: false,
              message: decision.reason,
            });
            return;
        }
      })().catch(() => {
        try {
          sendJson(res, 500, { ok: false, message: "internal error" });
        } catch {
          /* response already sent */
        }
      });
    });
    server.on("error", () => {
      resolveServer();
    });
    // 127.0.0.1 ONLY — never 0.0.0.0; the server is unreachable off the machine.
    // Port 0 → the OS assigns an ephemeral port; we learn it after binding.
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      session = { token, port, surfaces };
      onListening?.(`http://127.0.0.1:${String(port)}/?token=${token}`);
    });
    const stop = (): void => {
      server.close(() => {
        resolveServer();
      });
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
/* v8 ignore stop */
