"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The one place the app says "something is happening" for an in-place update.
 *
 * A route change is covered by `loading.tsx`, which Next streams the moment
 * the click lands. A filter, sort, range or page change is not: it re-renders
 * the same route with new `searchParams`, React keeps the old UI on screen
 * while the server works, and the 2026-09-06 review recorded exactly that as
 * "laggy / unresponsive". Every URL write goes through `useUrlNavigation`,
 * which reports its transition here, and this provider turns the union of
 * those into one indicator (brief G1).
 *
 * A counter rather than a boolean: two controls can be pending at once — a
 * debounced search settling while someone clicks a chip — and the bar must
 * only clear when the last one does.
 */
/**
 * How long the session history was when this document loaded.
 *
 * Captured at module scope, and this module is pulled in by the portal layout,
 * so it evaluates during the hydration of whichever page the reader landed on
 * — before any client-side navigation can have happened. Every entry above
 * this baseline is one this app pushed, which is what `BackLink` needs to know
 * that `history.back()` stays inside the app.
 *
 * `document.referrer` cannot answer that on its own: a client-side navigation
 * does not rewrite it, so a reader who typed the URL and then walked from the
 * list to a row still shows an empty referrer and would lose their filters to
 * a fallback push.
 */
const entryHistoryLength =
  typeof window === "undefined" ? 0 : window.history.length;

/** True once this app has pushed at least one entry in this document. */
export function hasInAppHistory(): boolean {
  return typeof window !== "undefined" && window.history.length > entryHistoryLength;
}

type NavProgressValue = {
  /** True while any registered transition is in flight. */
  active: boolean;
  report: (id: string, pending: boolean) => void;
};

const NavProgressContext = createContext<NavProgressValue | null>(null);

export function NavProgressProvider({ children }: { children: ReactNode }) {
  const pendingIds = useRef(new Set<string>());
  const [active, setActive] = useState(false);

  const report = useCallback((id: string, pending: boolean) => {
    if (pending) pendingIds.current.add(id);
    else pendingIds.current.delete(id);
    setActive(pendingIds.current.size > 0);
  }, []);

  const value = useMemo(() => ({ active, report }), [active, report]);

  return (
    <NavProgressContext value={value}>
      {/* Same geometry and the same keyframes as the upload queue's extraction
          bar: a short fill sliding a track. The length of a server render is
          unknown, so the bar reports motion and never a fraction. */}
      <div
        aria-hidden={!active}
        className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-[0.15s] ${
          active ? "bg-surface-soft opacity-100" : "opacity-0"
        }`}
      >
        {active ? (
          <div className="h-full w-2/5 rounded-pill bg-brand-gradient animate-indeterminate" />
        ) : null}
      </div>
      {children}
    </NavProgressContext>
  );
}

/**
 * Registers one transition with the bar. Returns a stable reporter; the
 * cleanup clears the entry so a control that unmounts mid-flight — a popover
 * closing on navigate — cannot leave the bar running forever.
 */
export function useNavProgress(pending: boolean): void {
  const context = useContext(NavProgressContext);
  const id = useId();
  const report = context?.report;

  useEffect(() => {
    if (!report) return;
    report(id, pending);
    return () => report(id, false);
  }, [id, pending, report]);
}

/** True while any in-place update is running. Drives the "Updating…" hints. */
export function useIsUpdating(): boolean {
  return useContext(NavProgressContext)?.active ?? false;
}
