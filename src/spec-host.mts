/**
 * The spec host — a child process that loads specs and streams results as NDJSON.
 *
 * ONE host per CLI command, not one per spec: Node startup and the TypeScript
 * load are paid once, then each spec costs a transpile.
 *
 * 🔴 **Why a child process at all, when `import()` works in-process.** Because a
 * module evaluation cannot be cancelled once started. `Promise.race` returns
 * control to the caller but the evaluation keeps running and holds the event
 * loop, so a spec that stalls at top level hangs `compile`, `test` and `audit`
 * with no bound. A child can be killed. That is the entire argument, and it is
 * why the in-process loader this replaced could not be repaired: it also had to
 * answer "did the module body already run?" to know whether re-running was
 * safe, and Node does not expose that bit — `ERR_MODULE_NOT_FOUND` and
 * `SyntaxError` each occur both before and during evaluation.
 *
 * Protocol, one JSON object per line each way:
 *   in   {"path":"<abs path to spec>"}
 *   out  {"path":"…","phase":"start"}          — emitted BEFORE evaluation
 *   out  {"path":"…","ok":true,"value":{…}}
 *   out  {"path":"…","ok":false,"error":"…"}
 *
 * The `start` line is what makes a hang diagnosable: when the parent's deadline
 * fires, the last `start` without a result NAMES the spec that stalled. Before
 * this, a stalled load produced N identical failures and no culprit.
 *
 * Values cross as JSON, which is not a new constraint — the previous `npx tsx`
 * path already did `JSON.stringify` in the child and `JSON.parse` in the parent,
 * so every spec that has ever loaded survived this round trip. Spec types carry
 * no functions; TypeScript is the authoring layer, the value is data.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./spec-hooks.mjs", import.meta.url));

function say(line: unknown): void {
  process.stdout.write(JSON.stringify(line) + "\n");
}

async function loadOne(path: string): Promise<void> {
  say({ path, phase: "start" });
  try {
    const mod = (await import(pathToFileURL(path).href)) as {
      default?: unknown;
    };
    // CJS interop can nest the default one level deeper.
    const raw = mod.default as { default?: unknown } | undefined;
    const value =
      raw && typeof raw === "object" && "default" in raw ? raw.default : raw;
    if (value === undefined) {
      say({ path, ok: false, error: "the spec has no default export." });
      return;
    }
    say({ path, ok: true, value });
  } catch (err) {
    say({
      path,
      ok: false,
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
  }
}

// Requests are serialised: a spec may depend on module state a previous one set
// up, and interleaving would make a hang impossible to attribute.
let queue: Promise<void> = Promise.resolve();
let buffered = "";

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk: string) => {
  buffered += chunk;
  let nl: number;
  while ((nl = buffered.indexOf("\n")) >= 0) {
    const line = buffered.slice(0, nl).trim();
    buffered = buffered.slice(nl + 1);
    if (!line) continue;
    const { path } = JSON.parse(line) as { path: string };
    queue = queue.then(() => loadOne(path));
  }
});
process.stdin.on("end", () => {
  queue.then(() => process.exit(0));
});
