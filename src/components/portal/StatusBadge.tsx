import type { PoStage } from "@/generated/prisma/enums";
import { stageColorVar, stageLabel } from "@/lib/po-stages";

/**
 * The intake statuses a row can carry before it becomes a purchase order.
 * A confirmed row shows its stage instead.
 */
export type IntakeStatus =
  | "EXTRACTING"
  | "NEEDS_REVIEW"
  | "RECEIVED"
  | "FAILED"
  | "NOT_CONFIRMED";

export type StatusTone = {
  label: string;
  /** For the badge's own text. */
  text: string;
  /** For a 6px dot — a background, so it cannot be swapped with `text`. */
  dot: string;
};

/**
 * One status palette (00-master.md §4). The filter chips above the table and
 * the badges inside it both read this map, which is what keeps a colour
 * meaning the same thing in both places.
 *
 * `accent-blue` means a process is running right now and nothing else.
 */
export const INTAKE_STATUS: Record<IntakeStatus, StatusTone> = {
  EXTRACTING: {
    label: "Extracting",
    text: "text-accent-blue",
    dot: "bg-accent-blue",
  },
  NEEDS_REVIEW: {
    label: "Needs review",
    text: "text-brand-amber",
    dot: "bg-brand-amber",
  },
  // `accent-blue` is the palette's "a process is running right now"
  // (00-master.md §4) — which is exactly true of an order a person has
  // picked up. It already covers uploading, extracting, in production and
  // delivering; this is a fifth thing in flight, not a second meaning.
  RECEIVED: {
    label: "Received",
    text: "text-accent-blue",
    dot: "bg-accent-blue",
  },
  FAILED: { label: "Failed", text: "text-accent-red", dot: "bg-accent-red" },
  NOT_CONFIRMED: {
    label: "Not confirmed",
    text: "text-ink-disabled",
    dot: "bg-ink-disabled",
  },
};

/**
 * The pill states its own type rather than inheriting it. Dropped into the
 * Status heading it came out in Plus Jakarta Sans at weight 650 with the
 * heading's -0.54px tracking, which closed the space in "In production" and
 * made the same badge read differently from the one in the page header two
 * rows above it. A status pill is UI text — Inter, normal weight — and the
 * design system's rule is that the two families are never crossed.
 */
const PILL_BASE =
  "inline-flex items-center gap-xxs rounded-full bg-surface-soft py-xxs font-sans text-[length:var(--text-caption)] font-normal tracking-normal";

const PILL = `${PILL_BASE} shrink-0 px-sm`;

/**
 * The same pill in a six-across stepper column, which at `sm` is about 90px
 * wide: tighter padding, and free to shrink and wrap its label rather than
 * push the page sideways.
 */
const PILL_COMPACT = `${PILL_BASE} min-w-0 px-xs text-center`;

/**
 * Coloured text on `surface-soft`, never a coloured fill, and the label is
 * always present — colour alone never carries meaning.
 */
export function StatusBadge({ status }: { status: IntakeStatus }) {
  const { label, text } = INTAKE_STATUS[status];
  return <span className={`${PILL} ${text}`}>{label}</span>;
}

/**
 * Where a stage sits against the order's current one. `current` is the
 * header's own badge, unchanged — everywhere a stage is named on a purchase
 * order reads the same pill, so there is one status palette and not a second
 * one invented per screen (2026-09-18). `done` and `upcoming` only step down
 * the ink ramp the stepper's plain labels already used.
 */
export type StageBadgeState = "current" | "done" | "upcoming";

const STATE_TEXT: Record<StageBadgeState, string> = {
  current: "text-ink",
  done: "text-ink-secondary",
  upcoming: "text-ink-tertiary",
};

/**
 * The same pill once a PO is confirmed. Text is `ink` for the five stages in
 * progress and `accent-green` for Delivered; the 6px dot carries the stage's
 * ramp colour so the badge still reads at a glance (design reference §4).
 *
 * A stage the order has not reached shows a hairline dot instead: the ramp
 * colour means "this happened", and colouring a future stage would promise it.
 */
export function StageBadge({
  stage,
  state = "current",
  compact = false,
}: {
  stage: PoStage;
  state?: StageBadgeState;
  compact?: boolean;
}) {
  const delivered = stage === "DELIVERED";
  const text =
    state === "current" && delivered ? "text-accent-green" : STATE_TEXT[state];
  return (
    <span className={`${compact ? PILL_COMPACT : PILL} ${text}`}>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{
          backgroundColor:
            state === "upcoming"
              ? "var(--color-hairline-strong)"
              : `var(${stageColorVar(stage)})`,
        }}
      />
      {stageLabel(stage)}
    </span>
  );
}
