"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  beginRouteProgress,
  decideAnchorClick,
  noteRouteLocation,
  registerSoftNavigation,
  subscribeRouteProgress,
} from "@/lib/route-progress";
import { RouteSkeletonSignal } from "@/components/portal/RouteSkeletonSignal";

/**
 * The one place the app says "something is happening".
 *
 * Two waits share the bar. A route change (a different path) starts it on the
 * click and holds it until that route's `loading.tsx` skeleton unmounts — the
 * URL moves earlier, when the skeleton is first allowed on screen. A refresh
 * (a new query on the same path, or `router.refresh()` inside a transition)
 * keeps the screen that is already up and says "Updating…" beside the bar.
 *
 * A map rather than a boolean: two controls can be pending at once — a
 * debounced search settling while someone clicks a chip — and the bar must
 * only clear when the last one does. Route and refresh stay distinct so a
 * route does not dim the page it is leaving as if the numbers were merely stale.
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

type WaitKind = "route" | "refresh";

type NavProgressValue = {
  /** True while a refresh of the current screen is in flight. */
  refreshing: boolean;
  report: (id: string, pending: boolean, kind?: WaitKind) => void;
};

const NavProgressContext = createContext<NavProgressValue | null>(null);

export function NavProgressProvider({ children }: { children: ReactNode }) {
  // Keep the skeleton signal in this chunk. A `loading.tsx` can then run it
  // in the same commit as the skeleton. Rendering it here would count as a
  // mounted skeleton and the bar would never settle.
  void RouteSkeletonSignal;
  const router = useRouter();
  const pathname = usePathname();
  const [waits, setWaits] = useState<ReadonlyMap<string, WaitKind>>(() => new Map());
  const [softPending, startSoft] = useTransition();

  const report = useCallback((id: string, pending: boolean, kind: WaitKind = "refresh") => {
    setWaits((current) => {
      const next = new Map(current);
      if (pending) next.set(id, kind);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => subscribeRouteProgress((route) => report("route", route, "route")), [report]);

  let routeWait = false;
  let refreshWait = softPending;
  for (const kind of waits.values()) {
    if (kind === "route") routeWait = true;
    else refreshWait = true;
  }
  const barOn = routeWait || refreshWait;
  const refreshing = refreshWait;

  useEffect(() => {
    noteRouteLocation();
  }, [pathname]);

  useEffect(() => {
    return registerSoftNavigation((href) => {
      startSoft(() => router.replace(href, { scroll: false }));
    });
  }, [router]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // Hit-testing lives in `decideAnchorClick` (composed path, then
      // closest). The window listener and `onRouterTransitionStart` begin
      // the same route earlier; this pass still owns same-path refresh,
      // which has to `preventDefault` so `loading.tsx` does not replace
      // the screen.
      const decision = decideAnchorClick(event, window.location.href);
      if (decision.kind === "ignore") return;
      if (decision.kind === "refresh") {
        event.preventDefault();
        startSoft(() => router.replace(decision.href, { scroll: false }));
        return;
      }
      beginRouteProgress();
    };
    const onPop = () => beginRouteProgress();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [router]);

  const value = useMemo(() => ({ refreshing, report }), [refreshing, report]);

  return (
    <NavProgressContext value={value}>
      {/* Same geometry and the same keyframes as the upload queue's extraction
          bar: a short fill sliding a track. The length of a server render is
          unknown, so the bar reports motion and never a fraction. */}
      <div
        data-route-progress={barOn ? "on" : "off"}
        aria-hidden={!barOn}
        className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-[0.15s] ${
          barOn ? "bg-surface-soft opacity-100" : "opacity-0"
        }`}
      >
        {barOn ? (
          <div className="h-full w-2/5 rounded-pill bg-brand-gradient animate-indeterminate" />
        ) : null}
      </div>
      {refreshing ? (
        <p
          role="status"
          data-updating="on"
          className="pointer-events-none fixed top-sm right-md z-50 rounded-pill border border-hairline bg-canvas px-sm py-xxs text-[length:var(--text-caption)] text-brand-link shadow-sm"
        >
          Updating…
        </p>
      ) : null}
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

/** True while the current screen is refreshing. Drives the "Updating…" hints. */
export function useIsUpdating(): boolean {
  return useContext(NavProgressContext)?.refreshing ?? false;
}
