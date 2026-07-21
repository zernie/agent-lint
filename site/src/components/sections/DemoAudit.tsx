import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Lock, CornerDownLeft, Check, Copy } from "lucide-react";
import { Report, type AuditReport } from "@vigiles/report-view";
import { normalizeSlug } from "@/lib/deeplink";
import { track } from "@/lib/track";
import { fetchRepo, type FetchProgress } from "@/demo/fetchRepo";
import { runAudit } from "@/demo/runAudit";
import { cn } from "@/lib/utils";

// Real audit reports, computed by the actual `vigiles audit` on real published
// plugins and baked at build time — the INSTANT one-tap examples. They render
// through the SAME @vigiles/report-view component a live typed run does, so a
// featured report and a repo you type are indistinguishable in authority.
import ohMy from "@/demo/reports/oh-my-claudecode.json";
import superpowers from "@/demo/reports/superpowers.json";
import wshobson from "@/demo/reports/wshobson-accessibility.json";
import madappgang from "@/demo/reports/madappgang-frontend.json";

type Featured = { slug: string; label: string; report: AuditReport };

// madappgang first — the one with a real finding + fix (a B "one fix from an A"),
// the sharpest demonstration. The rest are clean A's (real plugins usually are).
const FEATURED: Featured[] = [
  {
    slug: "madappgang/frontend",
    label: "madappgang/frontend",
    report: madappgang as unknown as AuditReport,
  },
  {
    slug: "oh-my-claudecode",
    label: "oh-my-claudecode",
    report: ohMy as unknown as AuditReport,
  },
  {
    slug: "obra/superpowers",
    label: "obra/superpowers",
    report: superpowers as unknown as AuditReport,
  },
  {
    slug: "wshobson/agents",
    label: "wshobson/agents",
    report: wshobson as unknown as AuditReport,
  },
];

const AUDIT_CMD = "npx vigiles audit";

/** Progressive, honest loading detail — every field is set by a resolved promise. */
type LoadingState = {
  treeCount: number | null;
  files: { done: number; of: number } | null;
};

/** The one thing on screen. A discriminated union — the frame renders off `k`. */
type View =
  | { k: "featured"; i: number }
  | { k: "loading"; slug: string; detail: LoadingState }
  | { k: "report"; slug: string; audit: AuditReport }
  | { k: "empty"; slug: string }
  | { k: "notfound"; slug: string }
  | { k: "ratelimit"; slug: string }
  | { k: "error"; slug: string };

/** A terminal (cacheable) view — everything a completed run can settle to. */
type TerminalView = Exclude<View, { k: "featured" } | { k: "loading" }>;

/** The `owner/repo` shown in the frame header for any view. */
function headerSlug(view: View): string {
  return view.k === "featured" ? FEATURED[view.i].slug : view.slug;
}

// ---------------------------------------------------------------------------

/** The typed-repo input — `$ vigiles audit ‹your-org/your-repo›`, Enter to grade. */
function RepoInput({ onSubmit }: { onSubmit: (slug: string) => void }) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState(false);

  const submit = (): void => {
    const slug = normalizeSlug(text);
    if (slug === null) {
      setHint(true);
      return;
    }
    setHint(false);
    onSubmit(slug);
  };

  const hasText = text.trim().length > 0;
  return (
    <div className="mx-auto mt-8 w-full max-w-[28rem]">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 font-mono text-base focus-within:border-accent/60">
        <span className="shrink-0 select-none text-muted-foreground">
          $ vigiles audit
        </span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (hint) setHint(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="your-org/your-repo"
          aria-label="GitHub repo to grade (owner/repo or URL)"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          // 16px min (text-base) so iOS doesn't zoom the viewport on focus.
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {hasText && (
          <button
            type="button"
            onClick={submit}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-accent"
          >
            <CornerDownLeft className="h-3.5 w-3.5" aria-hidden /> Grade
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {hint ? (
          <span>
            Use <span className="font-mono text-foreground">owner/repo</span> or
            paste a GitHub URL.
          </span>
        ) : (
          "Runs in your browser via the GitHub API — nothing leaves it."
        )}
      </p>
    </div>
  );
}

/** A quiet inline copy affordance for `npx vigiles audit` (edge-state frames). */
function InlineCommand() {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard?.writeText(AUDIT_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 align-middle font-mono text-xs text-foreground transition-colors hover:border-accent/50"
    >
      <span className="select-none text-muted-foreground">$</span>
      {AUDIT_CMD}
      {copied ? (
        <Check className="h-3.5 w-3.5 text-good" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}

/** The honest step log — three lines, each backed by a real awaited request. */
function StepLog({ detail }: { detail: LoadingState }) {
  const { treeCount, files } = detail;
  const filesDone = files !== null && files.done >= files.of;
  return (
    <div className="p-6 font-mono text-sm leading-relaxed sm:p-8">
      <div className="text-good">
        {treeCount === null ? (
          <span className="text-muted-foreground">→ fetching repo tree…</span>
        ) : (
          `✓ repo tree — ${treeCount} files`
        )}
      </div>
      {files !== null && (
        <div className={filesDone ? "text-good" : "text-muted-foreground"}>
          {filesDone
            ? `✓ read ${files.of} harness file${files.of === 1 ? "" : "s"}`
            : `→ reading harness files (${files.done} of ${files.of})…`}
        </div>
      )}
      {filesDone && (
        <div className="text-muted-foreground">
          → running deterministic checks…
        </div>
      )}
    </div>
  );
}

/** One in-frame edge state — same frame + header, terminal-toned body, own CTA. */
function EdgeState({ view }: { view: TerminalView }) {
  const slug = <span className="font-mono text-foreground">{view.slug}</span>;
  let body: ReactNode = null;
  if (view.k === "empty") {
    body = (
      <>
        <p>
          <strong className="text-foreground">
            No agent harness in {slug}.
          </strong>{" "}
          No CLAUDE.md, AGENTS.md, .claude/, or .codex/ — nothing for an agent
          audit to grade.
        </p>
        <p className="mt-3">
          Try a repo that ships skills, hooks, or agent instructions — or one of
          the featured plugins above. If your harness lives in a repo, grade it
          where it lives: <InlineCommand />
        </p>
      </>
    );
  } else if (view.k === "notfound") {
    body = (
      <p>
        <strong className="text-foreground">Couldn&apos;t read {slug}</strong> —
        not found, or private. The browser demo can only fetch public repos. The
        CLI has no such limit — it reads your working copy, and nothing leaves
        your machine: <InlineCommand />
      </p>
    );
  } else if (view.k === "ratelimit") {
    body = (
      <p>
        <strong className="text-foreground">
          GitHub&apos;s anonymous API limit hit
        </strong>{" "}
        (60 requests/hour per IP — not vigiles&apos;s limit). The featured
        reports above still work. Or skip the API entirely — the CLI reads your
        disk: <InlineCommand />
      </p>
    );
  } else {
    body = (
      <p>
        <strong className="text-foreground">Couldn&apos;t reach GitHub</strong>{" "}
        for {slug}. Check your connection and try again — or run it locally,
        where nothing leaves your machine: <InlineCommand />
      </p>
    );
  }
  return (
    <div className="p-6 text-sm leading-relaxed text-muted-foreground sm:p-8">
      {body}
    </div>
  );
}

/** The A-grade tease — the one honest line for a clean typed repo. */
function AGradeNote() {
  return (
    <div className="border-b border-border bg-good/5 px-5 py-3 text-sm leading-relaxed text-muted-foreground sm:px-7">
      <strong className="text-foreground">
        A — clean on every check a browser can run.
      </strong>{" "}
      The open question is behavioral: do your skills actually fire? That needs
      a real model — the row below is your next step.
    </div>
  );
}

// ---------------------------------------------------------------------------

export function DemoAudit() {
  const [view, setView] = useState<View>({ k: "featured", i: 0 });
  const [loadingVisible, setLoadingVisible] = useState(false);

  // Session cache: a repo audited once re-shows instantly (no re-fetch).
  const cache = useRef(new Map<string, TerminalView>());
  // Ignore stale async: only the latest run may commit.
  const runId = useRef(0);
  // The last frame with real content — kept on screen during the <200ms
  // loading-suppression window so a fast run never flashes a skeleton.
  const prevFrame = useRef<View>({ k: "featured", i: 0 });
  const abort = useRef<AbortController | null>(null);
  const suppressTimer = useRef<number | null>(null);

  const run = useCallback((slug: string): void => {
    track("demo_typed_submit", { slug });
    const id = ++runId.current;
    abort.current?.abort();

    // Cached → straight to the settled view, no loading, no request.
    const cached = cache.current.get(slug);
    if (cached) {
      setView(cached);
      prevFrame.current = cached;
      syncUrl(cached);
      track(`demo_run_${runKind(cached)}`, { slug, cached: true });
      return;
    }

    const controller = new AbortController();
    abort.current = controller;
    setView({ k: "loading", slug, detail: { treeCount: null, files: null } });
    // Suppress the step log for ~200ms so a tiny/cached repo goes straight to
    // the report with no skeleton flash.
    setLoadingVisible(false);
    if (suppressTimer.current) window.clearTimeout(suppressTimer.current);
    suppressTimer.current = window.setTimeout(() => {
      if (runId.current === id) setLoadingVisible(true);
    }, 200);

    const onProgress = (p: FetchProgress): void => {
      if (runId.current !== id) return;
      setView((v) =>
        v.k === "loading"
          ? {
              ...v,
              detail:
                p.phase === "tree"
                  ? {
                      treeCount: p.treeCount,
                      files: { done: 0, of: p.harnessCount },
                    }
                  : { ...v.detail, files: { done: p.done, of: p.of } },
            }
          : v,
      );
    };

    void fetchRepo(slug, onProgress, controller.signal).then((outcome) => {
      if (runId.current !== id) return;
      let settled: TerminalView;
      if (outcome.kind === "ok") {
        // The "running deterministic checks" step — real work, no padding.
        const audit = runAudit(outcome.files, slug);
        settled = { k: "report", slug, audit };
      } else if (outcome.kind === "no-harness") {
        settled = { k: "empty", slug };
      } else if (outcome.kind === "not-found") {
        settled = { k: "notfound", slug };
      } else if (outcome.kind === "rate-limit") {
        settled = { k: "ratelimit", slug };
      } else {
        settled = { k: "error", slug };
      }
      cache.current.set(slug, settled);
      prevFrame.current = settled;
      setView(settled);
      syncUrl(settled);
      track(`demo_run_${runKind(settled)}`, { slug });
    });
  }, []);

  // Deep-link: on load with ?repo=owner/repo, auto-run it.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("repo");
    const slug = param ? normalizeSlug(param) : null;
    if (slug) run(slug);
    // run is stable (useCallback []) — mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickChip = (i: number): void => {
    // Instant baked report — no loading, leaves input text in place.
    ++runId.current;
    abort.current?.abort();
    setLoadingVisible(false);
    const v: View = { k: "featured", i };
    setView(v);
    prevFrame.current = v;
    track("demo_chip", { slug: FEATURED[i].slug });
  };

  // What to render in the frame: during the suppression window keep the prior
  // frame; otherwise render the current view.
  const frameView: View =
    view.k === "loading" && !loadingVisible ? prevFrame.current : view;
  const isEdge =
    frameView.k === "empty" ||
    frameView.k === "notfound" ||
    frameView.k === "ratelimit" ||
    frameView.k === "error";
  const isAGrade =
    frameView.k === "report" && frameView.audit.score.grade === "A";
  // The lock row + bottom command belong with a REAL report (and the loading
  // that becomes one); an edge state carries its own inline CTA, so they'd only
  // duplicate it (and read as a back-to-back command on mobile).
  const showConversion = !isEdge;

  return (
    <section
      id="try"
      className="scroll-mt-20 border-t border-border bg-card/30"
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            A real grade, for a real repo.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            The same report{" "}
            <span className="font-mono text-foreground">vigiles audit</span>{" "}
            prints — deterministic, model-free.{" "}
            <span className="text-foreground">
              Run it on any public repo, right here
            </span>{" "}
            — or pick a published plugin:
          </p>
        </div>

        <RepoInput onSubmit={run} />

        {/* Featured chips — one-tap examples. Wrap + centered on every width so a
            chip never clips at the mobile viewport edge (only four, so mobile is
            two tidy rows, not a pushed-down fold). */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {FEATURED.map((f, i) => {
            const active = frameView.k === "featured" && frameView.i === i;
            return (
              <button
                key={f.slug}
                type="button"
                onClick={() => pickChip(i)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 font-mono text-sm transition-colors",
                  active
                    ? "border-accent/60 bg-accent/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-accent/40 hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* The report frame — one component, every state renders inside it (no
            toast, no layout jump). */}
        <div className="reveal mt-8 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="border-b border-border bg-card/40 px-5 py-2.5 font-mono text-xs text-muted-foreground">
            $ vigiles audit {headerSlug(frameView)}
          </div>
          {frameView.k === "loading" ? (
            <StepLog detail={frameView.detail} />
          ) : isEdge ? (
            <EdgeState view={frameView as TerminalView} />
          ) : (
            <div>
              {isAGrade && <AGradeNote />}
              <div className="p-5 sm:p-7">
                <Report
                  data={
                    frameView.k === "report"
                      ? frameView.audit
                      : FEATURED[(frameView as { i: number }).i].report
                  }
                />
              </div>
            </div>
          )}
        </div>

        {showConversion && (
          <>
            {/* The honest model-gated tease — ONE row. Everything above is what
                the browser can compute; this names the one thing it can't. */}
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-card/40 px-5 py-4">
              <Lock
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">
                  Whether your skills actually fire
                </span>{" "}
                — and your guidance changes what the agent does — needs a real
                model, and a browser can&apos;t ask one.{" "}
                <span className="text-foreground">Your CLI can</span>, on your
                Claude subscription. No API key, no signup, free.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** The instrument suffix for a settled run. */
function runKind(
  v: TerminalView,
): "ok" | "empty" | "notfound" | "ratelimit" | "error" {
  switch (v.k) {
    case "report":
      return "ok";
    case "empty":
      return "empty";
    case "notfound":
      return "notfound";
    case "ratelimit":
      return "ratelimit";
    case "error":
      return "error";
  }
}

/** Reflect a successfully-read repo in the URL (?repo=) so the result is shareable. */
function syncUrl(v: TerminalView): void {
  if (v.k !== "report" && v.k !== "empty") return;
  const url = new URL(window.location.href);
  url.searchParams.set("repo", v.slug);
  window.history.replaceState(null, "", url.toString());
}
