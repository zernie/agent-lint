/**
 * audit-serve security/routing suite (vitest, pure — no http, no IO): the
 * decision logic that gates the one-click adoption server. The threat model is a
 * malicious website firing requests at the loopback server; these assert it's
 * refused (token + origin), a path can't traverse outside the allowlist, and the
 * routes dispatch correctly.
 */
import { describe, it, expect } from "vitest";
import {
  tokenOk,
  originOk,
  resolveSurface,
  decideServe,
  decideServeGate,
  newToken,
  serveAudit,
  type ServeSession,
} from "./audit-serve.js";

const SESSION: ServeSession = {
  token: "a".repeat(32),
  port: 51234,
  surfaces: new Set(["skills/foo/SKILL.md", "agents/bar.md"]),
};

const req = (over: Partial<Parameters<typeof decideServe>[0]> = {}) => ({
  method: "POST",
  path: "/adopt",
  token: SESSION.token,
  origin: `http://127.0.0.1:${String(SESSION.port)}`,
  target: "skills/foo/SKILL.md",
  ...over,
});

describe("tokenOk", () => {
  it("accepts the exact token, rejects wrong / missing / wrong-length", () => {
    expect(tokenOk("a".repeat(32), "a".repeat(32))).toBe(true);
    expect(tokenOk("b".repeat(32), "a".repeat(32))).toBe(false);
    expect(tokenOk(null, "a".repeat(32))).toBe(false);
    expect(tokenOk("a".repeat(31), "a".repeat(32))).toBe(false); // length guard
  });
});

describe("originOk", () => {
  it("accepts loopback + absent, rejects a foreign origin", () => {
    expect(originOk("http://127.0.0.1:51234", 51234)).toBe(true);
    expect(originOk("http://localhost:51234", 51234)).toBe(true);
    expect(originOk(null, 51234)).toBe(true); // token is the guard then
    expect(originOk("https://evil.example.com", 51234)).toBe(false);
    expect(originOk("http://127.0.0.1:9999", 51234)).toBe(false); // wrong port
  });
});

describe("resolveSurface", () => {
  it("resolves an allowlisted path only — never a raw/traversal path", () => {
    expect(resolveSurface("agents/bar.md", SESSION.surfaces)).toBe(
      "agents/bar.md",
    );
    expect(resolveSurface("../../etc/passwd", SESSION.surfaces)).toBe(null);
    expect(resolveSurface("skills/other/SKILL.md", SESSION.surfaces)).toBe(
      null,
    );
    expect(resolveSurface(null, SESSION.surfaces)).toBe(null);
  });
});

describe("decideServe — routing + the CSRF/traversal guards", () => {
  it("GET / serves the report page", () => {
    expect(decideServe(req({ method: "GET", path: "/" }), SESSION).kind).toBe(
      "report",
    );
  });

  it("a valid adopt POST is allowed and resolves the target", () => {
    const d = decideServe(req(), SESSION);
    expect(d).toEqual({ kind: "adopt", target: "skills/foo/SKILL.md" });
  });

  it("THREAT: a foreign-origin POST with no token is rejected (CSRF)", () => {
    const d = decideServe(
      req({ origin: "https://evil.example.com", token: null }),
      SESSION,
    );
    expect(d).toMatchObject({ kind: "reject", status: 403 });
  });

  it("a same-origin POST with a wrong token is rejected", () => {
    const d = decideServe(req({ token: "b".repeat(32) }), SESSION);
    expect(d).toMatchObject({ kind: "reject", status: 403 });
  });

  it("THREAT: a path-traversal target is rejected even with a valid token", () => {
    const d = decideServe(req({ target: "../../etc/cron.d/x" }), SESSION);
    expect(d).toMatchObject({ kind: "reject", status: 400 });
  });

  it("adopt-all and shutdown require POST + token, then dispatch", () => {
    expect(decideServe(req({ path: "/adopt-all" }), SESSION).kind).toBe(
      "adopt-all",
    );
    expect(decideServe(req({ path: "/shutdown" }), SESSION).kind).toBe(
      "shutdown",
    );
    expect(
      decideServe(req({ path: "/adopt-all", token: null }), SESSION).kind,
    ).toBe("reject");
  });

  it("a GET on a mutating route is 405; an unknown path is 404", () => {
    expect(
      decideServe(req({ method: "GET", path: "/adopt" }), SESSION),
    ).toMatchObject({ kind: "reject", status: 405 });
    expect(
      decideServe(req({ method: "GET", path: "/whatever" }), SESSION),
    ).toMatchObject({ kind: "reject", status: 404 });
  });
});

describe("decideServeGate", () => {
  const base = {
    serveFlag: false,
    noServeFlag: false,
    json: false,
    isTTY: true,
    ownRepo: true,
    adoptableCount: 2,
  };
  it("asks at a TTY with adoptable surfaces (the default)", () => {
    expect(decideServeGate(base)).toBe("ask");
  });
  it("--serve forces serve, --no-serve forces skip", () => {
    expect(decideServeGate({ ...base, serveFlag: true })).toBe("serve");
    expect(decideServeGate({ ...base, noServeFlag: true })).toBe("skip");
  });
  it("headless never serves (no TTY or --json)", () => {
    expect(decideServeGate({ ...base, isTTY: false })).toBe("skip");
    expect(decideServeGate({ ...base, json: true })).toBe("skip");
  });
  it("a foreign repo never serves — even with --serve (writes specs → own repo only)", () => {
    expect(decideServeGate({ ...base, ownRepo: false })).toBe("skip");
    expect(decideServeGate({ ...base, ownRepo: false, serveFlag: true })).toBe(
      "skip",
    );
  });
  it("nothing adoptable → skip the prompt", () => {
    expect(decideServeGate({ ...base, adoptableCount: 0 })).toBe("skip");
  });
});

describe("newToken", () => {
  it("is 32 hex chars and differs each call", () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe("serveAudit — real HTTP end-to-end (no browser)", () => {
  it("serves the report, runs adopt on a valid POST, and rejects a forged one", async () => {
    const token = newToken();
    const adopted: string[] = [];
    let url = "";
    const done = serveAudit({
      token,
      surfaces: new Set(["skills/foo/SKILL.md"]),
      html: "<html>REPORT</html>",
      runAdopt: (t) => {
        adopted.push(t);
        return Promise.resolve({ ok: true, message: `ok ${t}` });
      },
      runAdoptAll: () => Promise.resolve({ ok: true, message: "all" }),
      onListening: (u) => {
        url = u.split("/?")[0]; // strip the ?token= for our own requests
      },
    });
    // wait for listen
    for (let i = 0; i < 50 && !url; i++)
      await new Promise((r) => setTimeout(r, 10));
    const origin = url;

    // GET / serves the report HTML
    const page = await fetch(url + "/");
    expect(await page.text()).toContain("REPORT");

    // forged POST: no token → 403, adopt NOT run
    const forged = await fetch(url + "/adopt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "skills/foo/SKILL.md" }),
    });
    expect(forged.status).toBe(403);

    // valid POST: token + origin + allowlisted target → adopt runs
    const ok = await fetch(url + "/adopt", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vigiles-token": token,
        origin,
      },
      body: JSON.stringify({ target: "skills/foo/SKILL.md" }),
    });
    expect(ok.status).toBe(200);
    expect(adopted).toEqual(["skills/foo/SKILL.md"]);

    // off-list target → 400, not run
    const bad = await fetch(url + "/adopt", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vigiles-token": token,
        origin,
      },
      body: JSON.stringify({ target: "../../etc/x" }),
    });
    expect(bad.status).toBe(400);
    expect(adopted).toEqual(["skills/foo/SKILL.md"]); // unchanged

    // shutdown ends the server
    await fetch(url + "/shutdown", {
      method: "POST",
      headers: { "x-vigiles-token": token, origin },
    });
    await done;
  });
});
