import type { BookingStatus, PoStage } from "@/generated/prisma/enums";
import { Badge, type BadgeTone } from "@/components/arc/badge/badge";
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
  | "NOT_CONFIRMED"
  /** A booking confirmation somebody has checked (2026-10-08). */
  | "REVIEWED";

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
  // The PO list's Confirmed green: done, nothing left to do.
  REVIEWED: { label: "Reviewed", text: "text-accent-green", dot: "bg-accent-green" },
};

/** A booking confirmation's status as the intake badge it reads as. */
export const BOOKING_BADGE: Record<BookingStatus, IntakeStatus> = {
  // Never listed or opened; mapped only so the record is total.
  UPLOADING: "EXTRACTING",
  EXTRACTING: "EXTRACTING",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  FAILED: "FAILED",
  REVIEWED: "REVIEWED",
};

/**
 * Each status as Arc's badge, in its nearest tone. The label is always
 * present — colour alone never carries meaning.
 */
const INTAKE_TONE: Record<IntakeStatus, BadgeTone> = {
  EXTRACTING: "info",
  NEEDS_REVIEW: "warning",
  RECEIVED: "info",
  FAILED: "danger",
  NOT_CONFIRMED: "neutral",
  REVIEWED: "success",
};

export function StatusBadge({ status }: { status: IntakeStatus }) {
  return (
    <Badge tone={INTAKE_TONE[status]} size="sm" className="shrink-0">
      {INTAKE_STATUS[status].label}
    </Badge>
  );
}

/**
 * Where a stage sits against the order's current one. Everywhere a stage is
 * named on a purchase order reads the same badge, so there is one status
 * palette and not a second one invented per screen (2026-09-18).
 */
export type StageBadgeState = "current" | "done" | "upcoming";

/**
 * The same badge once a PO is confirmed: neutral for the five stages in
 * progress and success for Delivered, the one stage that reads as done. The
 * 6px dot carries the stage's ramp colour so the badge still reads at a
 * glance (design reference §4).
 *
 * A stage the order has not reached shows a hairline dot instead: the ramp
 * colour means "this happened", and colouring a future stage would promise it.
 */
export function StageBadge({
  stage,
  state = "current",
}: {
  stage: PoStage;
  state?: StageBadgeState;
}) {
  const delivered = stage === "DELIVERED";
  return (
    <Badge
      tone={state === "current" && delivered ? "success" : "neutral"}
      size="sm"
      className="shrink-0"
      icon={
        <span
          aria-hidden
          className="block size-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor:
              state === "upcoming"
                ? "var(--color-hairline-strong)"
                : `var(${stageColorVar(stage)})`,
          }}
        />
      }
    >
      {stageLabel(stage)}
    </Badge>
  );
}
