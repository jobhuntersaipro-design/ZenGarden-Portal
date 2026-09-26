/**
 * The shortest time a loading state stays on screen (2026-09-26, asked for
 * as "for every loading, add 0.2s … I want to show it's loading", taken as a
 * floor rather than an addition). A load that answers in 40ms used to swap
 * its skeleton, spinner or progress bar away before it had registered, which
 * read as a flicker rather than as the app working. Loads slower than this
 * gain nothing, so no screen is slower than it already was.
 */
export const LOADING_FLOOR_MS = 200;

/** Resolves once the floor has passed since it was called. Instant in tests. */
export function loadingFloor(ms = LOADING_FLOOR_MS): Promise<void> {
  if (process.env.NODE_ENV === "test") return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves with `work`'s value, but never sooner than the floor. `work`
 * runs alongside the timer, not after it, so a slow load is not slowed
 * further. A rejection passes straight through: `notFound()` and
 * `redirect()` are thrown, and holding them back would only delay the page
 * saying so.
 */
export async function atLeastFloor<T>(work: Promise<T> | T, ms = LOADING_FLOOR_MS): Promise<T> {
  const [value] = await Promise.all([work, loadingFloor(ms)]);
  return value;
}

/**
 * A page component whose render takes at least the floor. Every portal,
 * admin and shop page is exported through this, so the route's
 * `loading.tsx` skeleton — and the progress bar, the "Updating…" hint and
 * the pending chip that a filter, sort or page change shows while the same
 * page re-renders — each stay up long enough to be seen. The auth pages are
 * left out: they sit under no skeleton, so a floor there is only a slower
 * page.
 */
export function withLoadingFloor<P>(Page: (props: P) => Promise<React.ReactNode> | React.ReactNode) {
  return function PageWithLoadingFloor(props: P) {
    return atLeastFloor(Page(props));
  };
}
