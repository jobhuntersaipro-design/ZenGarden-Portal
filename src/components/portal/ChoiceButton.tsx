"use client";

import type { ComponentProps } from "react";
import { Spinner } from "@/components/portal/Spinner";

/**
 * One option in a group where exactly one is selected — a range preset, a
 * status chip, a segmented toggle. Pair it with `usePendingChoice`, which
 * decides `selected`, `pending` and `dimmed` for every option in the group.
 *
 * Two looks, each a fixed geometry: the `pill` (dark when selected, the
 * design reference's chip) and the `segment` (a cell in a bordered strip).
 * While one option is in flight it carries the ring spinner beside its label
 * and the others drop to 60% so the group reads as busy; the group itself
 * says so with `aria-busy`. Nothing is disabled — a second click supersedes
 * the first, and React keeps the last write.
 */
/**
 * Every look is 44px tall on a touch-sized screen and drops to the design
 * system's 36px chip height from `sm` up. The 2026-09-06 review counted 55
 * interactive elements under 44px on the dashboard alone (A7), and these three
 * looks are most of them.
 */
const LOOKS = {
  /** The range preset and quick-filter pill. `compact` drops to caption type. */
  pill: {
    base: "h-control-md sm:h-control-sm rounded-pill px-md focus-visible:outline-offset-2",
    regular: "text-[length:var(--text-body-sm)]",
    compact: "text-[length:var(--text-caption)]",
    on: "bg-ink text-canvas",
    off: "bg-surface-soft text-ink-secondary hover:text-ink",
  },
  /** The small status chip with a colour dot, on the Purchase orders list. */
  chip: {
    base: "min-h-control-md sm:min-h-0 rounded-full px-sm py-xxs text-[length:var(--text-caption)] focus-visible:outline-offset-2",
    regular: "",
    compact: "",
    on: "bg-ink text-canvas",
    off: "bg-surface-soft text-ink-secondary hover:text-ink",
  },
  /** A cell in a bordered strip. `compact` tightens the padding. */
  segment: {
    // `shrink-0` because the strip is an `overflow-x-auto` scroller on narrow
    // screens; without it the cells squeeze to fit instead of scrolling.
    base: "h-control-md sm:h-control-sm shrink-0 text-[length:var(--text-caption)] -outline-offset-2",
    regular: "px-md",
    compact: "px-sm",
    on: "bg-surface-soft font-semibold text-ink",
    off: "text-ink-secondary hover:text-ink",
  },
} as const;

export function ChoiceButton({
  look,
  selected,
  pending = false,
  dimmed = false,
  compact = false,
  className = "",
  children,
  ...props
}: Omit<ComponentProps<"button">, "type"> & {
  look: keyof typeof LOOKS;
  selected: boolean;
  /** This option was clicked and the server has not answered yet. */
  pending?: boolean;
  /** Another option in the group is pending. */
  dimmed?: boolean;
  compact?: boolean;
}) {
  const style = LOOKS[look];
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex items-center justify-center gap-xxs transition focus-visible:outline-2 focus-visible:outline-focus ${style.base} ${
        compact ? style.compact : style.regular
      } ${selected ? style.on : style.off} ${dimmed ? "opacity-60" : ""} ${className}`}
      {...props}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}
