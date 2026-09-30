import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * False on the server and during hydration, true after.
 *
 * For parts whose markup Node and the browser cannot agree on: Arc's calendar
 * and range picker print dates through `Intl`, and Node's ICU and Chrome's
 * differ ("Thursday 10 December" against "Thursday, 10 December", "1–30"
 * against "1 – 30"), so a server render never matches (60-arc-foundation §5).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}
