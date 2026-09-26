"use client";

import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Spinner } from "@/components/portal/Spinner";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { atLeastFloor } from "@/lib/loading-floor";

/** How far the finger must travel, after resistance, before a release refreshes. */
export const PULL_THRESHOLD = 72;
/** The indicator stops here however far the finger goes. */
const PULL_MAX = 112;
/** The finger moves twice as far as the indicator, so the pull feels weighted. */
const RESISTANCE = 0.5;
/** Where the indicator rests, hidden above the top edge. */
const REST = -56;

/**
 * The indicator's distance for a finger that has travelled `dy` down the
 * screen: halved, then capped. Pure so the threshold and the cap can be
 * tested without a touch screen.
 */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0;
  return Math.min(dy * RESISTANCE, PULL_MAX);
}

/**
 * True when a touch starting at `target` belongs to something other than the
 * page: an open dialog or sheet (Radix locks the body while one is up), or a
 * scroller of its own that is not at its top — pulling down there scrolls it,
 * as it should.
 */
function ownedElsewhere(target: EventTarget | null): boolean {
  if (document.body.hasAttribute("data-scroll-locked")) return true;
  let node = target instanceof Element ? target : null;
  if (node?.closest("[role=dialog]")) return true;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollTop > 0) return true;
    node = node.parentElement;
  }
  return false;
}

type Phase = "idle" | "pulling" | "refreshing";

/**
 * Pull down from the top of the page to refresh it (2026-09-26). A home-screen
 * app on iOS has no browser chrome and so no pull-to-refresh of its own, which
 * left the only way to see a new order as closing the app. Touch only, so a
 * mouse never meets it.
 *
 * The refresh is `router.refresh()`, awaited: the server components re-render
 * with fresh data while filters, open rows and form drafts stay as they are —
 * a full reload would throw those away. The spinner holds until the new
 * payload has landed, not until the request was merely sent.
 *
 * A pull only starts at the very top of the page, downward, and not inside a
 * dialog or a scroller that has its own scroll. A mostly sideways drag — a
 * chart or a wide table — is left alone. While pulling, the page's own bounce
 * is cancelled, and `overscroll-behavior-y` in `globals.css` stops the
 * browser's pull-to-refresh competing with this one.
 */
export function PullToRefresh() {
  // Stable: `useAwaitableRefresh` memoises on the router, so the listeners
  // below are registered once.
  const refresh = useAwaitableRefresh();

  const [phase, setPhase] = useState<Phase>("idle");
  const [pull, setPull] = useState(0);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let decided = false;
    let current = 0;
    let busy = false;

    const reset = () => {
      start = null;
      decided = false;
      current = 0;
    };

    const onStart = (event: TouchEvent) => {
      if (busy || event.touches.length !== 1) return;
      if (window.scrollY > 0 || ownedElsewhere(event.target)) return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
      decided = false;
    };

    const onMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!decided) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        // Sideways, upward, or no longer at the top: not a pull.
        if (Math.abs(dx) > Math.abs(dy) || dy < 0 || window.scrollY > 0) {
          reset();
          return;
        }
        decided = true;
        setPhase("pulling");
      }
      event.preventDefault();
      const next = pullDistance(dy);
      if (current < PULL_THRESHOLD && next >= PULL_THRESHOLD) navigator.vibrate?.(8);
      current = next;
      setPull(next);
    };

    const onEnd = async () => {
      if (!start || !decided) {
        reset();
        return;
      }
      const released = current;
      reset();
      if (released < PULL_THRESHOLD) {
        setPhase("idle");
        setPull(0);
        return;
      }
      busy = true;
      setPhase("refreshing");
      setPull(PULL_THRESHOLD);
      try {
        // Held for the loading floor, so a refresh that answers at once
        // still shows its spinner rather than a flicker.
        await atLeastFloor(refresh());
      } finally {
        busy = false;
        setPhase("idle");
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refresh]);

  const armed = pull >= PULL_THRESHOLD;
  const progress = Math.min(pull / PULL_THRESHOLD, 1);

  return (
    <div
      data-pull-refresh={phase}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
    >
      <div
        className={`flex size-10 items-center justify-center rounded-full border border-hairline bg-canvas text-ink shadow-sm ${
          phase === "pulling" ? "" : "transition-transform duration-200 ease-out motion-reduce:transition-none"
        }`}
        style={{
          transform: `translateY(${REST + pull}px)`,
          opacity: phase === "idle" ? 0 : Math.max(progress, 0.4),
        }}
      >
        {phase === "refreshing" ? (
          <Spinner />
        ) : (
          <ArrowDown
            aria-hidden
            className={`size-4 transition-transform duration-150 motion-reduce:transition-none ${
              armed ? "rotate-180" : ""
            }`}
          />
        )}
      </div>
      <span role="status" className="sr-only">
        {phase === "refreshing" ? "Refreshing" : ""}
      </span>
    </div>
  );
}
