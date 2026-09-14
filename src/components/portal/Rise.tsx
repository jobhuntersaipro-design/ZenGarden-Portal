import type { ReactNode } from "react";

/**
 * Literal class names, because Tailwind scans source text: a `stagger-${n}`
 * built at runtime produces no CSS at all. Twelve steps of 30ms is the cap —
 * past that the last card of a long list would arrive noticeably after the
 * first, and a reader waiting for it is not what an entrance is for.
 */
const STAGGER = [
  "stagger-0",
  "stagger-1",
  "stagger-2",
  "stagger-3",
  "stagger-4",
  "stagger-5",
  "stagger-6",
  "stagger-7",
  "stagger-8",
  "stagger-9",
  "stagger-10",
  "stagger-11",
  "stagger-12",
] as const;

export function staggerClass(index: number): string {
  return STAGGER[Math.min(Math.max(index, 0), STAGGER.length - 1)];
}

/**
 * A block that arrives: a short fade and rise (`--animate-rise`), delayed by
 * `index` steps so siblings enter one after another. Nothing under
 * `prefers-reduced-motion` — the rule in `globals.css` cancels the animation,
 * and `both` fill leaves the block simply present.
 */
export function Rise({
  index = 0,
  className = "",
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  return <div className={`animate-rise ${staggerClass(index)} ${className}`}>{children}</div>;
}
