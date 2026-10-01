"use client";

import type { ComponentProps } from "react";
import { motion, useReducedMotion } from "motion/react";
import chip from "@/components/arc/chip-group/chip-group.module.css";
import segment from "@/components/arc/segmented-control/segmented-control.module.css";
import { motionTokens } from "@/components/arc/lib/motion-tokens";
import { Spinner } from "@/components/portal/Spinner";

/**
 * One option in a group where exactly one is selected — a range preset, a
 * status chip, a segmented toggle. Pair it with `usePendingChoice`, which
 * decides `selected`, `pending` and `dimmed` for every option in the group.
 *
 * A `segment` is one of Arc's segmented-control buttons: the white selection
 * slides between them (SegmentGroup supplies the LayoutGroup). A `pill` or
 * `chip` is one of Arc's chips: a pill-shaped surface that takes a quiet
 * accent tint when chosen. While one option is in flight it carries the ring
 * spinner beside its label and the others drop to 60% so the group reads as
 * busy; the group itself says so with `aria-busy`. Nothing is disabled — a
 * second click supersedes the first, and React keeps the last write.
 */
export function ChoiceButton({
  look,
  selected,
  pending = false,
  dimmed = false,
  className = "",
  children,
  ...props
}: Omit<ComponentProps<"button">, "type"> & {
  look: "pill" | "chip" | "segment";
  selected: boolean;
  /** This option was clicked and the server has not answered yet. */
  pending?: boolean;
  /** Another option in the group is pending. */
  dimmed?: boolean;
}) {
  const reduced = useReducedMotion();
  if (look === "segment") {
    return (
      <button
        type="button"
        aria-pressed={selected}
        className={`${segment.button} ${dimmed ? "opacity-60" : ""} ${className}`}
        {...props}
      >
        {selected ? (
          <motion.span
            className={segment.selection}
            layoutId="selection"
            transition={reduced ? { duration: 0 } : motionTokens.spring.morph}
            aria-hidden
          />
        ) : null}
        <span className={segment.label}>
          {pending ? <Spinner /> : null}
          {children}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`${chip.chip} ${dimmed ? "opacity-60" : ""} ${className}`}
      {...props}
    >
      <span className={`${chip.body} max-sm:h-control-md`} data-selected={selected}>
        <span className={`${chip.surface} right-0`} aria-hidden />
        <span className={`${chip.label} inline-flex items-center gap-xxs`}>
          {pending ? <Spinner /> : null}
          {children}
        </span>
      </span>
    </button>
  );
}
