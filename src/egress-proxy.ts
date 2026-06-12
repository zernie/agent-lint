/**
 * Recording egress proxy — runs INSIDE the sandbox netns (on loopback), so a
 * confined hook configured with `HTTP(S)_PROXY` routes its network attempts here.
 * It RECORDS each target (`host:port`) to an ndjson log and BLOCKS it (responds
 * 502 / closes) — the netns already has no external route, so nothing actually
 * leaves; this just turns "silently blocked" into "blocked AND recorded", so a
 * test can assert what a hook/skill tried to reach (phone-home / which registry
 * an install would hit).
 *
 * Honest limit: this records what PROXY-honoring tools (npm, pip, curl, fetch)
 * attempt. Raw-socket egress bypasses the proxy — but the netns still blocks it
 * hard, so it can't get out; it just won't appear in the record. The block is the
 * boundary; the record is best-effort observability over it.
 *
 * Run as: `node dist/egress-proxy.js <egress-log-path> <port-file-path>`.
 */
/* v8 ignore start -- a standalone subprocess run only inside the sandbox netns;
   exercised by the bwrap-gated end-to-end test, not the unit gate. The pure
   parser (parseEgressLog) carries the testable logic. */
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const [, , logPath, portPath] = process.argv;

function record(host: string, port: number): void {
  try {
    appendFileSync(
      logPath,
      JSON.stringify({ host, port, ts: Date.now() }) + "\n",
    );
  } catch {
    /* best-effort: a recording failure must not crash the hook under test */
  }
}

const server = createServer((req, res) => {
  // Plain HTTP via a proxy: req.url is absolute, e.g. http://host:port/path.
  try {
    const u = new URL(req.url ?? "");
    record(u.hostname, Number(u.port) || 80);
  } catch {
    /* unparseable target — skip */
  }
  res.writeHead(502, { "content-type": "text/plain" });
  res.end("blocked by vigiles egress recorder\n");
});

// HTTPS via a proxy: the client sends `CONNECT host:port`. Record + refuse.
server.on("connect", (req, socket) => {
  const [host, port] = (req.url ?? "").split(":");
  record(host, Number(port) || 443);
  socket.write("HTTP/1.1 502 Blocked\r\n\r\n");
  socket.end();
});

server.on("clientError", (_e, socket) => socket.destroy());

server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  // Hand the chosen port back to the wrapper, which exports HTTP(S)_PROXY.
  writeFileSync(portPath, String(port));
});
/* v8 ignore stop */
