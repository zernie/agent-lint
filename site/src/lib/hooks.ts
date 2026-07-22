/**
 * Two tiny UI hooks the repo combobox needs — a debounced value and an
 * outside-click detector. Hand-rolled (each ~10 lines) rather than pulling a hooks
 * dependency into the deliberately-lean site: a debounce and a click-outside are
 * well-known primitives, and owning them keeps the bundle small with zero API to
 * learn. Swap to `usehooks-ts` here if the site ever needs more of that surface.
 */
import { useEffect, useState, type RefObject } from "react";

/** `value` after it has stopped changing for `delayMs` — the classic input debounce. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Call `onOutside` when a pointerdown/touch lands outside `ref`'s element — used to
 * dismiss the combobox dropdown. `enabled` gates the listener so it isn't attached
 * while the dropdown is closed (nothing to dismiss).
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: Event): void => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) onOutside();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [ref, onOutside, enabled]);
}
