"use client";

import type { ReactNode } from "react";
import { useEdgeFades } from "@/hooks/useEdgeFades";

/**
 * A row of pill chips: one scrolling row on a phone, wrapped from `sm`.
 *
 * Wrapped on a phone, the date-range chips took two rows of an 844px screen
 * for a choice the reader makes once. Scrolling keeps them on one line, and
 * the faded edge says there is more to reach — a strip cut at the screen edge
 * with no cue reads as broken (lessons §4). `*:shrink-0` stops the chips
 * squeezing instead of scrolling.
 */
export function ChipStrip({
  busy,
  className = "",
  children,
}: {
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { ref, clipped, measure } = useEdgeFades<HTMLDivElement>();

  return (
    <div className={`relative min-w-0 max-sm:basis-full ${className}`}>
      <div
        ref={ref}
        onScroll={measure}
        aria-busy={busy || undefined}
        className="flex items-center gap-xxs *:shrink-0 max-sm:overflow-x-auto sm:flex-wrap"
      >
        {children}
      </div>
      {clipped.left ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-xl bg-linear-to-r from-canvas to-transparent sm:hidden"
        />
      ) : null}
      {clipped.right ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-xl bg-linear-to-l from-canvas to-transparent sm:hidden"
        />
      ) : null}
    </div>
  );
}
