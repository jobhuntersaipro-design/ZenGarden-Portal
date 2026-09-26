"use client";

import { useEffect, useState } from "react";
import { LOADING_FLOOR_MS } from "@/lib/loading-floor";

/**
 * `flag`, but once it turns on it stays on for at least `ms` — the loading
 * floor. Turning on is immediate; only turning off waits, so a slow action
 * reads exactly as before and a 30ms one still shows its spinner long
 * enough to be seen.
 *
 * The switch-on is noticed during render (React's "adjusting state when a
 * prop changes" pattern), and the timer that ends the hold starts at that
 * moment — so the floor counts from when the spinner appeared, not from
 * when the work finished.
 */
export function useHeldFlag(flag: boolean, ms = LOADING_FLOOR_MS): boolean {
  const [wasOn, setWasOn] = useState(flag);
  const [holding, setHolding] = useState(flag);

  if (flag !== wasOn) {
    setWasOn(flag);
    if (flag) setHolding(true);
  }

  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(() => setHolding(false), ms);
    return () => clearTimeout(timer);
  }, [holding, ms]);

  return flag || holding;
}
