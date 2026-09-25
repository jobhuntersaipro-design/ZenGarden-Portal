"use client";

import { useEffect, useState } from "react";

/** How long `animate-conceal` runs — kept in step with `globals.css`. */
export const CONCEAL_MS = 180;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Keeps something on screen long enough to animate out (2026-09-25).
 *
 * `open` is what the reader asked for; `mounted` is whether to render, and
 * stays true for one `CONCEAL_MS` after `open` goes false so `closing` can
 * play `animate-conceal`. `appear` is whether mounting should grow in — false
 * for what was already open when the page loaded. Opening is immediate. Under reduced motion there is
 * no animation to wait for, so a close unmounts at once — otherwise the rows
 * would sit there fully visible and then vanish, which is worse than either.
 *
 * `mounted` is adjusted during render rather than in an effect, the React way
 * for state derived from a prop; only the delayed unmount is an effect.
 */
export function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const closing = mounted && !open;
  // Something open when the page arrived did not "open": it only grows in
  // once the reader has closed it at least once.
  const [appear, setAppear] = useState(!open);
  if (!open && !appear) setAppear(true);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : CONCEAL_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  return { mounted, closing, appear };
}
