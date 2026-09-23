import { beginClientRoute, installRouteProgressClick } from "@/lib/route-progress";

/**
 * Runs when Next starts a client navigation, from the anchor's own click —
 * the path that still soft-navigates when the progress listener never saw
 * an `<a>`. A same-path query is left alone so it stays a refresh.
 */
export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
): void {
  // Push, replace and back all start the same bar. The href decides whether
  // this one is a route; `navigationType` is part of Next's hook signature.
  void navigationType;
  beginClientRoute(url);
}

installRouteProgressClick();
