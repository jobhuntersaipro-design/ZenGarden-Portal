"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 900;
/** Ease-out cubic. */
const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts up to `value` — but only as an enhancement over a value that is
 * already on screen.
 *
 * The hook returns `value` itself on the first render, so a server-rendered
 * page, a screenshot, a print or a PDF export always shows the real figure.
 * The animation starts after mount and runs once per mounted tile; it does not
 * replay when the range, aggregation, trend or disclosure changes, because
 * those re-render the same mounted component with a new value and `started`
 * stays true.
 *
 * This is not hypothetical: a PDF export of the canvas caught the count-up at
 * t=0 and every KPI read "RM 0.00" beside tables showing millions, and the
 * design review filed it as a data bug.
 */
export function useCountUp(value: number): number {
  /**
   * Null except while a frame is in flight, so the hook falls through to the
   * real `value` on the first render and again the moment the animation ends.
   * Holding the displayed number in state instead would mean writing `value`
   * into it from the effect on every later change — a synchronised copy of
   * something already to hand.
   */
  const [animated, setAnimated] = useState<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // One animation per mounted tile. A range, aggregation, trend or
    // disclosure change re-renders this same component with a new number, and
    // that must not replay the count.
    if (started.current) return;
    started.current = true;

    if (value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      if (progress < 1) {
        setAnimated(value * ease(progress));
        frame = requestAnimationFrame(tick);
      } else {
        setAnimated(null);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return animated ?? value;
}
