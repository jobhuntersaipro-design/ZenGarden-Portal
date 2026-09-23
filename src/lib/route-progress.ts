/**
 * One decision for "the reader asked to go somewhere": a different path is a
 * route (the bar runs until that page's skeleton leaves), a new query on the
 * same path is a refresh (the screen already up stays up).
 *
 * The URL moves when Next is allowed to show `loading.tsx`, which is before
 * the page data arrives. Settling the bar on the URL would finish it on the
 * skeleton. `depth` is how many of those skeletons are mounted.
 *
 * A skeleton that mounts *after* the URL only increments `depth`. It cannot
 * turn the bar back on. So a URL commit with nothing mounted yet must not
 * clear immediately — see `ROUTE_SKELETON_GRACE_MS`.
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

/**
 * How long a URL commit may sit with no skeleton before the bar gives up.
 *
 * Portal list links sit in the viewport, so Next often has them prefetched
 * and the click paints the next page without `loading.tsx`. The pathname
 * effect then runs with `depth === 0`. Clearing in that same turn leaves
 * `data-route-progress="off"` for a check at ~100ms. The grace keeps the bar
 * up across that gap. A skeleton that mounts in it cancels the timer; the
 * bar then lasts until that skeleton unmounts, which is the slow-load case.
 *
 * Child layout effects run before this effect, so a skeleton in the *same*
 * commit is already counted and no timer is armed.
 */
export const ROUTE_SKELETON_GRACE_MS = 1000;

type ProgressSlot = {
  state: RouteProgressState;
  listeners: Set<RouteListener>;
  giveUp: ReturnType<typeof setTimeout> | null;
  hold: ReturnType<typeof setTimeout> | null;
  softNavigate: ((href: string) => void) | null;
  clickInstalled: boolean;
};

const SLOT_KEY = "__zgRouteProgress";

type GlobalWithSlot = typeof globalThis & { [SLOT_KEY]?: ProgressSlot };

/**
 * One slot for every copy of this module. The client instrumentation entry
 * and the shell's progress provider are separate bundles; each would
 * otherwise keep its own `route` flag, and a begin in one would never reach
 * the bar subscribed in the other.
 */
function slot(): ProgressSlot {
  const g = globalThis as GlobalWithSlot;
  let current = g[SLOT_KEY];
  if (!current) {
    current = {
      state: { depth: 0, route: false },
      listeners: new Set(),
      giveUp: null,
      hold: null,
      softNavigate: null,
      clickInstalled: false,
    };
    g[SLOT_KEY] = current;
  }
  return current;
}

function emit(next: RouteProgressState) {
  const current = slot();
  const changed = next.route !== current.state.route;
  current.state = next;
  if (!changed) return;
  for (const listener of current.listeners) listener(current.state.route);
}

function clearHold(current: ProgressSlot) {
  if (!current.hold) return;
  clearTimeout(current.hold);
  current.hold = null;
}

/** The bar for a route change. Idempotent while one is already running. */
export function beginRouteProgress(): void {
  const current = slot();
  // A grace armed by the previous URL must not clear this navigation.
  clearHold(current);
  emit(reduceRouteProgress(current.state, "begin"));
  if (current.giveUp) clearTimeout(current.giveUp);
  if (typeof window === "undefined") return;
  // A navigation that never paints a page (aborted, or a skeleton that
  // errors out of the tree) must not leave the bar up.
  current.giveUp = setTimeout(() => {
    slot().giveUp = null;
    settleRouteProgress();
  }, 10_000);
}

export function settleRouteProgress(): void {
  const current = slot();
  if (current.giveUp) clearTimeout(current.giveUp);
  current.giveUp = null;
  clearHold(current);
  if (!current.state.route) return;
  emit({ ...current.state, route: false });
}

/**
 * Mount and unmount of a `loading.tsx` skeleton (`PageSkeleton`). The unmount
 * flush is a microtask so React strict mode's mount → cleanup → mount does
 * not settle the bar in the cleanup.
 */
export function noteRouteSkeleton(mounted: boolean): void {
  const current = slot();
  if (mounted) clearHold(current);
  emit(reduceRouteProgress(current.state, mounted ? "mount" : "unmount"));
  if (mounted) return;
  queueMicrotask(() => {
    emit(reduceRouteProgress(slot().state, "flush"));
  });
}

/**
 * The URL committed. A skeleton already in this commit (its layout effect
 * ran first) keeps the bar until it leaves. With nothing mounted, wait out
 * the grace so a skeleton in the next commit can still hold the bar.
 */
export function noteRouteLocation(): void {
  const current = slot();
  if (current.state.depth > 0 || !current.state.route) {
    clearHold(current);
    return;
  }
  clearHold(current);
  current.hold = setTimeout(() => {
    const live = slot();
    live.hold = null;
    if (live.state.depth === 0) emit(reduceRouteProgress(live.state, "location"));
  }, ROUTE_SKELETON_GRACE_MS);
}

export function subscribeRouteProgress(listener: RouteListener): () => void {
  const current = slot();
  current.listeners.add(listener);
  listener(current.state.route);
  return () => {
    slot().listeners.delete(listener);
  };
}

/**
 * Same-path query changes go through whoever mounted the progress provider,
 * which keeps the current screen and reports a refresh. Returns false when
 * that provider is not mounted, so the caller can navigate itself.
 */
export function registerSoftNavigation(fn: (href: string) => void): () => void {
  const current = slot();
  current.softNavigate = fn;
  return () => {
    const live = slot();
    if (live.softNavigate === fn) live.softNavigate = null;
  };
}

export function requestSoftNavigation(href: string): boolean {
  const navigate = slot().softNavigate;
  if (!navigate) return false;
  navigate(href);
  return true;
}

type AnchorBits = {
  href: string;
  target: string | null;
  download: boolean;
};

function anchorBits(node: EventTarget | null): AnchorBits | null {
  if (!node || typeof node !== "object") return null;
  if (!("tagName" in node) || !("href" in node) || !("getAttribute" in node)) return null;
  const el = node as {
    tagName: unknown;
    href: unknown;
    getAttribute: (name: string) => string | null;
    hasAttribute?: (name: string) => boolean;
  };
  if (typeof el.tagName !== "string" || el.tagName.toUpperCase() !== "A") return null;
  if (typeof el.href !== "string" || typeof el.getAttribute !== "function") return null;
  return {
    href: el.href,
    target: el.getAttribute("target"),
    download: typeof el.hasAttribute === "function" ? el.hasAttribute("download") : false,
  };
}

/** What a click handler can see without depending on a DOM class. */
export type AnchorClickLike = {
  defaultPrevented: boolean;
  /** Missing means a primary click. A non-zero button is a new tab or a menu. */
  button?: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  composedPath?: () => EventTarget[];
};

/**
 * The anchor a click belongs to. `composedPath` first: a hit on an SVG icon
 * (the portal tab bar) can be a target whose `closest` never walks out to
 * the HTML `<a>`, while the path still contains it. Next's own handler is
 * on that `<a>`, so the navigation still happens.
 */
export function anchorFromClick(event: AnchorClickLike): AnchorBits | null {
  const path = event.composedPath?.() ?? [];
  for (const node of path) {
    const found = anchorBits(node);
    if (found) return found;
  }
  const target = event.target;
  if (!target || typeof target !== "object" || !("closest" in target)) return null;
  const closest = (target as { closest?: (selector: string) => EventTarget | null }).closest;
  if (typeof closest !== "function") return null;
  return anchorBits(closest.call(target, "a"));
}

/** Route, refresh, or ignore for one click. Does not call `preventDefault`. */
export function decideAnchorClick(event: AnchorClickLike, current: string): AnchorNavigation {
  if (event.defaultPrevented) return { kind: "ignore" };
  if (typeof event.button === "number" && event.button !== 0) return { kind: "ignore" };
  const anchor = anchorFromClick(event);
  if (!anchor) return { kind: "ignore" };
  return classifyAnchorNavigation({
    href: anchor.href,
    current,
    target: anchor.target,
    download: anchor.download,
    modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
  });
}

/**
 * Next calls this from `onRouterTransitionStart` with the href it is about
 * to commit. Only a different path starts the bar; a same-path query is the
 * refresh the provider already handles.
 */
export function beginClientRoute(href: string, current?: string): void {
  const here = current ?? (typeof window === "undefined" ? "" : window.location.href);
  if (!here) return;
  const decision = classifyAnchorNavigation({
    href,
    current: here,
    target: null,
    download: false,
    modified: false,
  });
  if (decision.kind === "route") beginRouteProgress();
}

/**
 * Capture on `window`, once, before hydration. Runs ahead of any later
 * listener that marks the click `defaultPrevented`, and ahead of the
 * provider's own listener. Refresh stays with the provider: this only
 * begins a route, and it does not cancel the click.
 */
export function installRouteProgressClick(): void {
  if (typeof window === "undefined") return;
  const current = slot();
  if (current.clickInstalled) return;
  current.clickInstalled = true;
  window.addEventListener(
    "click",
    (event: MouseEvent) => {
      const decision = decideAnchorClick(event, window.location.href);
      if (decision.kind === "route") beginRouteProgress();
    },
    true,
  );
}

/** Drops the shared slot's timers and listeners. Tests only. */
export function resetRouteProgressForTests(): void {
  const current = slot();
  if (current.giveUp) clearTimeout(current.giveUp);
  current.giveUp = null;
  clearHold(current);
  current.state = { depth: 0, route: false };
  current.listeners.clear();
  current.softNavigate = null;
}
