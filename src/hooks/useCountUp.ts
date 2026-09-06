"use client";

import { useEffect, useRef, useState } from "react";

/** The duration the 2026-09-06 brief asked for. */
export const COUNT_UP_MS = 2000;

const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts a headline figure up to `value`.
 *
 * Three rules keep this honest, and they are the reason the animation could
 * come back after being cut on 2026-09-06:
 *
 * 1. The server's figure is the initial state, so the HTML, the first paint
 *    and any static capture of the markup all hold the true number. The
 *    animation is an enhancement layered on top of a correct render, never
 *    the render itself.
 * 2. The first mount counts from zero. Every later change counts from the
 *    frame that is currently on screen, so switching range mid-flight
 *    continues from what the eye last saw instead of dropping back to zero.
 * 3. `prefers-reduced-motion` skips it entirely — the value is simply set.
 */
export function useCountUp(value: number, duration = COUNT_UP_MS): number {
  const [display, setDisplay] = useState(value);
  // What is painted right now. A ref, not the state, because the effect that
  // starts a new run must read it without listing it as a dependency.
  const shown = useRef(value);
  const mounted = useRef(false);

  useEffect(() => {
    // The first mount counts from zero; every later change counts from the
    // frame that is currently on screen.
    const from = mounted.current ? shown.current : 0;
    mounted.current = true;
    // Record the starting point before the first frame can run. React runs
    // effects twice in development: the first pass is cancelled by its own
    // cleanup, often before a single frame fires, and without this line the
    // second pass would read `shown` as still holding the final value, decide
    // nothing had moved, and skip the mount animation entirely — in dev only,
    // which is exactly where it would be missed.
    shown.current = from;

    // Reduced motion, and a value that has not moved, land on the target on
    // the very first frame. Expressing them as a zero-length run rather than
    // an early `setDisplay` keeps this effect to a single state write, and
    // that write inside the animation callback.
    const span = reducedMotion() || from === value ? 0 : duration;

    // The clock starts on the first frame, not here. A frame already in
    // flight when this effect runs carries a timestamp from *before* it, so
    // measuring against `performance.now()` gave a negative progress on the
    // first tick or two — and an ease-out cubic of a negative progress is
    // negative, which painted "-RM 8,851.78" under a Total sales label.
    let startedAt = 0;
    let frame = 0;
    const tick = (now: number) => {
      if (startedAt === 0) startedAt = now;
      const progress = span === 0 ? 1 : Math.min(1, (now - startedAt) / span);
      const next =
        progress === 1 ? value : from + (value - from) * easeOutCubic(progress);
      shown.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return display;
}
