import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Star } from "lucide-react";
import { normalizeSlug } from "@/lib/deeplink";
import { useDebouncedValue, useClickOutside } from "@/lib/hooks";
import {
  fetchOwnerRepos,
  rankRepos,
  formatStars,
  type RepoHit,
  type SearchFn,
  type SearchOutcome,
} from "@/demo/searchRepos";
import { cn } from "@/lib/utils";

/**
 * The typed-repo input, upgraded to an AUTOCOMPLETE combobox: type an owner and it
 * suggests that owner's public repos (with star counts) to pick from; type
 * `owner/repo` and Enter still grades directly. Autocomplete is an ENHANCEMENT layered
 * over the plain slug+Enter path — any lookup failure (unknown owner, rate-limit,
 * offline) just shows no suggestions, never blocks the direct submit. The GitHub
 * lookup is injected (`search`) so a test / the sandbox drives it with mock data.
 */

/** Split the typed text into `{ owner, fragment }` — everything before the first `/`
 *  is the owner; the rest is the repo fragment we filter the owner's repos against. */
function splitOwnerFragment(text: string): { owner: string; fragment: string } {
  const trimmed = text.trim();
  const i = trimmed.indexOf("/");
  if (i < 0) return { owner: trimmed, fragment: "" };
  return { owner: trimmed.slice(0, i), fragment: trimmed.slice(i + 1) };
}

/** A lookup we cache: a stable owner result (ok / not-found). Rate-limit + error stay
 *  retryable, mirroring the audit fetch's isCacheable. */
function isCacheable(o: SearchOutcome): boolean {
  return o.kind === "ok" || o.kind === "not-found";
}

export function RepoCombobox({
  onSubmit,
  search = fetchOwnerRepos,
}: {
  onSubmit: (slug: string) => void;
  search?: SearchFn;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  // null = idle, "loading" = owner lookup in flight, else the settled outcome.
  const [outcome, setOutcome] = useState<SearchOutcome | "loading" | null>(
    null,
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, SearchOutcome>());
  const reqId = useRef(0);
  const abort = useRef<AbortController | null>(null);

  const { owner, fragment } = splitOwnerFragment(text);
  const debouncedOwner = useDebouncedValue(owner, 300);

  // Fetch the owner's repos once per owner (cached), debounced so a partial owner
  // isn't looked up on every keystroke. Filtering by `fragment` is client-side (below).
  useEffect(() => {
    if (debouncedOwner.length < 1) {
      setOutcome(null);
      return;
    }
    const cached = cache.current.get(debouncedOwner);
    if (cached) {
      setOutcome(cached);
      return;
    }
    const id = ++reqId.current;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setOutcome("loading");
    void search(debouncedOwner, ctrl.signal).then((o) => {
      if (reqId.current !== id) return; // a newer owner superseded us
      if (isCacheable(o)) cache.current.set(debouncedOwner, o);
      setOutcome(o);
    });
  }, [debouncedOwner, search]);

  useClickOutside(rootRef, () => setOpen(false), open);

  const hits: readonly RepoHit[] =
    outcome !== null && outcome !== "loading" && outcome.kind === "ok"
      ? rankRepos(outcome.repos, fragment)
      : [];

  // Keep the active row in range as the hit list changes under the cursor.
  useEffect(() => setActive(-1), [text]);

  const submit = (slugRaw?: string): void => {
    const slug = normalizeSlug(slugRaw ?? text);
    if (slug === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setOpen(false);
    onSubmit(slug);
  };
  const pick = (hit: RepoHit): void => {
    setText(hit.fullName);
    submit(hit.fullName);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      if (hits.length > 0) setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && hits[active]) pick(hits[active]);
      else submit();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const hasText = text.trim().length > 0;
  const loading = outcome === "loading";
  const rateLimited =
    outcome !== null && outcome !== "loading" && outcome.kind === "rate-limit";
  // Show the panel only when there's something to say — suggestions, a live search,
  // or the one actionable note (rate limit → use the direct path).
  const showPanel =
    open && hasText && (hits.length > 0 || loading || rateLimited);

  return (
    <div ref={rootRef} className="relative mx-auto mt-8 w-full max-w-[28rem]">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 font-mono text-base focus-within:border-accent/60">
        <span className="shrink-0 select-none text-muted-foreground">
          $ vigiles audit
        </span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (invalid) setInvalid(false);
          }}
          onFocus={() => {
            if (hasText) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="your-org/your-repo"
          aria-label="GitHub repo to grade (owner/repo or URL)"
          aria-expanded={showPanel}
          aria-autocomplete="list"
          role="combobox"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          // 16px min (text-base) so iOS doesn't zoom the viewport on focus.
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {hasText && (
          <button
            type="button"
            onClick={() => submit()}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-accent"
          >
            <CornerDownLeft className="h-3.5 w-3.5" aria-hidden /> Grade
          </button>
        )}
      </div>

      {showPanel && (
        <div
          role="listbox"
          className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-border bg-background py-1 shadow-2xl"
        >
          {loading && (
            <div className="px-4 py-2.5 font-mono text-sm text-muted-foreground">
              searching <span className="text-foreground">@{owner}</span>…
            </div>
          )}
          {rateLimited && (
            <div className="px-4 py-2.5 text-sm text-muted-foreground">
              GitHub&apos;s anonymous rate limit is hit — type the full{" "}
              <span className="font-mono text-foreground">owner/repo</span> and
              press Enter to grade it directly.
            </div>
          )}
          {hits.map((hit, i) => (
            <button
              key={hit.fullName}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(hit)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                i === active ? "bg-accent/10" : "hover:bg-card",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm text-foreground">
                  {hit.name}
                  {hit.archived && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      archived
                    </span>
                  )}
                </span>
                {hit.description && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {hit.description}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Star className="h-3 w-3" aria-hidden />
                {formatStars(hit.stars)}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-center text-xs text-muted-foreground">
        {invalid ? (
          <span>
            Use <span className="font-mono text-foreground">owner/repo</span> or
            paste a GitHub URL.
          </span>
        ) : (
          "Public repos, graded in your browser — nothing leaves it."
        )}
      </p>
    </div>
  );
}
