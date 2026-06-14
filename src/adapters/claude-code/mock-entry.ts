/**
 * vigiles — the in-sandbox mock entry.
 *
 * Run as a subprocess INSIDE the bubblewrap network namespace (see
 * `src/sandbox.ts`), so the scripted mock lives on the sandbox's isolated
 * loopback — reachable by the confined `claude`, unreachable from outside.
 * Reads the model script from a file, streams each captured request to an ndjson
 * file the parent reads back (for `trace.modelRequests`), and writes its chosen
 * port so the wrapper can point `ANTHROPIC_BASE_URL` at it.
 *
 *   node mock-entry.js <scriptFile> <requestsFile> <portFile>
 *
 * Not unit-tested directly (it's a daemon driven only through a live sandbox);
 * exercised end-to-end by the bwrap-backed integration test.
 */
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";

import { startMock, type ModelTurn } from "./mock-model.js";

void (async (): Promise<void> => {
  const [scriptFile, requestsFile, portFile] = process.argv.slice(2);
  if (!scriptFile || !requestsFile || !portFile) {
    process.stderr.write("mock-entry: scriptFile requestsFile portFile\n");
    process.exit(2);
  }
  const turns = JSON.parse(readFileSync(scriptFile, "utf-8")) as ModelTurn[];
  const handle = await startMock(turns, {
    onRequest: (req) => {
      appendFileSync(requestsFile, JSON.stringify(req) + "\n");
    },
  });
  // Signal readiness last: the wrapper waits for a non-empty port file.
  writeFileSync(portFile, new URL(handle.url).port);
  // Stay alive until the wrapper kills us once `claude` has finished.
})();
