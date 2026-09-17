"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

/**
 * How many orders are waiting on the team, shared by the sidebar, the phone's
 * tab bar and the review queue section (Phase 46).
 *
 * Seeded by the portal layout, then kept current from the browser, because
 * the layout is not re-rendered on a client-side navigation: without this the
 * sidebar read 4 beside a queue section reading 5 (measured). It re-reads on
 * every navigation, when the tab regains focus and once a minute; the queue
 * section also writes the count it just rendered, so on /purchase-orders the
 * two can never disagree.
 */
type ReviewCountValue = { count: number; setCount: (count: number) => void };

const ReviewCountContext = createContext<ReviewCountValue | null>(null);

/** Often enough to notice a new shop order; one small aggregate per tab. */
const REFRESH_MS = 60_000;

/** The server's current count, or null when it could not be read. */
async function readCount(): Promise<number | null> {
  try {
    const response = await fetch("/api/review-queue/count", { cache: "no-store" });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return typeof body === "object" &&
      body !== null &&
      "count" in body &&
      typeof body.count === "number"
      ? body.count
      : null;
  } catch {
    // Offline or mid-deploy: keep the last number rather than blank it.
    return null;
  }
}

export function ReviewCountProvider({
  initial,
  children,
}: {
  initial: number;
  children: ReactNode;
}) {
  const [count, setCount] = useState(initial);
  const [seed, setSeed] = useState(initial);
  const pathname = usePathname();

  // A server render that did happen — a Server Action's revalidation, a
  // reload — carries a fresher number than the one held here. Adjusted during
  // render rather than in an effect, so there is no frame with the old one.
  if (seed !== initial) {
    setSeed(initial);
    setCount(initial);
  }

  useEffect(() => {
    let cancelled = false;
    const apply = (next: number | null) => {
      if (!cancelled && next !== null) setCount(next);
    };
    // On arrival at every page, and then on focus and once a minute.
    void readCount().then(apply);
    const timer = setInterval(() => void readCount().then(apply), REFRESH_MS);
    const onFocus = () => void readCount().then(apply);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  const value = useMemo(() => ({ count, setCount }), [count]);
  return <ReviewCountContext value={value}>{children}</ReviewCountContext>;
}

/** Outside the provider the count is simply zero, and nothing renders. */
export function useReviewCount(): ReviewCountValue {
  return useContext(ReviewCountContext) ?? { count: 0, setCount: () => {} };
}

/**
 * Rendered by the review queue section: the number it just drew becomes the
 * shell's, so the badge and the heading beside it agree on the same paint.
 */
export function ReviewCountSync({ count }: { count: number }) {
  const { setCount } = useReviewCount();
  useEffect(() => setCount(count), [count, setCount]);
  return null;
}
