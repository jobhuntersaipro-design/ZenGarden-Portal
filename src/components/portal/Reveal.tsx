import type { ReactNode } from "react";

/**
 * Content that grows into place and shrinks out of it (2026-09-25). The
 * surrounding page moves over 220ms instead of in one frame. `closing` plays
 * the reverse; `usePresence` keeps the content mounted long enough for it.
 *
 * `className` goes on the innermost box, which is where any padding belongs:
 * the box between it and the grid is what reaches zero height, and it can
 * only do that if nothing on it — padding included — has a height of its own.
 */
export function Reveal({
  closing = false,
  appear = true,
  className = "",
  children,
}: {
  closing?: boolean;
  /**
   * Whether mounting grows in. False for content that was simply there when
   * the page loaded: growing every row of a page into place on arrival would
   * be the very jump this exists to prevent.
   */
  appear?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const motion = closing ? "animate-conceal" : appear ? "animate-reveal" : "";
  return (
    <div className={`reveal ${motion}`}>
      <div className="min-h-0 overflow-hidden">
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
