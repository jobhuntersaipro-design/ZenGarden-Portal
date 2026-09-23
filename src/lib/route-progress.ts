/**
 * One decision for "the reader asked to go somewhere": a different path is a
 * route (the bar runs until that page's skeleton leaves), a new query on the
 * same path is a refresh (the screen already up stays up).
 *
 * The URL moves when Next is allowed to show `loading.tsx`, which is before
 * the page data arrives. Settling the bar on the URL would finish it on the
 * skeleton. `depth` is how many of those skeletons are mounted.
 */

export type RouteProgressState = {
  depth: number;
  route: boolean;
};

export type RouteProgressEvent = "begin" | "mount" | "unmount" | "location" | "flush";

export function reduceRouteProgress(
  state: RouteProgressState,
  event: RouteProgressEvent,
): RouteProgressState {
  if (event === "begin") return { ...state, route: true };
  if (event === "mount") return { ...state, depth: state.depth + 1 };
  if (event === "unmount") return { ...state, depth: Math.max(0, state.depth - 1) };
  if (state.depth === 0) return { ...state, route: false };
  return state;
}

export type AnchorNavigation =
  | { kind: "ignore" }
  | { kind: "route" }
  | { kind: "refresh"; href: string };

export function classifyAnchorNavigation(input: {
  href: string;
  current: string;
  target: string | null;
  download: boolean;
  modified: boolean;
}): AnchorNavigation {
  if (input.modified || input.download) return { kind: "ignore" };
  if (input.target && input.target !== "_self") return { kind: "ignore" };

  let next: URL;
  let here: URL;
  try {
    here = new URL(input.current);
    next = new URL(input.href, here);
  } catch {
    return { kind: "ignore" };
  }

  if (next.origin !== here.origin) return { kind: "ignore" };
  if (next.pathname === here.pathname && next.search === here.search) {
    return { kind: "ignore" };
  }

  if (next.pathname === here.pathname) {
    return { kind: "refresh", href: `${next.pathname}${next.search}` };
  }
  return { kind: "route" };
}

type RouteListener = (route: boolean) => void;

let state: RouteProgressState = { depth: 0, route: false };
const listeners = new Set<RouteListener>();
let giveUp: ReturnType<typeof setTimeout> | null = null;
let softNavigate: ((href: string) => void) | null = null;

function emit(next: RouteProgressState) {
  const changed = next.route !== state.route;
  state = next;
  if (!changed) return;
  for (const listener of listeners) listener(state.route);
}

/** The bar for a route change. Idempotent while one is already running. */
export function beginRouteProgress(): void {
  emit(reduceRouteProgress(state, "begin"));
  if (giveUp) clearTimeout(giveUp);
  if (typeof window === "undefined") return;
  // A navigation that never paints a page (aborted, or a skeleton that
  // errors out of the tree) must not leave the bar up.
  giveUp = setTimeout(() => {
    giveUp = null;
    settleRouteProgress();
  }, 10_000);
}

export function settleRouteProgress(): void {
  if (giveUp) clearTimeout(giveUp);
  giveUp = null;
  if (!state.route) return;
  emit({ ...state, route: false });
}

/**
 * Mount and unmount of a `loading.tsx` skeleton (`PageSkeleton`). The unmount
 * flush is a microtask so React strict mode's mount → cleanup → mount does
 * not settle the bar in the cleanup.
 */
export function noteRouteSkeleton(mounted: boolean): void {
  emit(reduceRouteProgress(state, mounted ? "mount" : "unmount"));
  if (mounted) return;
  queueMicrotask(() => {
    emit(reduceRouteProgress(state, "flush"));
  });
}

/** The URL committed. Settle only when no skeleton is standing in for the page. */
export function noteRouteLocation(): void {
  queueMicrotask(() => {
    emit(reduceRouteProgress(state, "location"));
  });
}

export function subscribeRouteProgress(listener: RouteListener): () => void {
  listeners.add(listener);
  listener(state.route);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Same-path query changes go through whoever mounted the progress provider,
 * which keeps the current screen and reports a refresh. Returns false when
 * that provider is not mounted, so the caller can navigate itself.
 */
export function registerSoftNavigation(fn: (href: string) => void): () => void {
  softNavigate = fn;
  return () => {
    if (softNavigate === fn) softNavigate = null;
  };
}

export function requestSoftNavigation(href: string): boolean {
  if (!softNavigate) return false;
  softNavigate(href);
  return true;
}
