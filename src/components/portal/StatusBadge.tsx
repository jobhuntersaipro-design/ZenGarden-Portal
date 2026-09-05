import type { PoStage } from "@/generated/prisma/enums";
import { stageColorVar, stageLabel } from "@/lib/po-stages";

/**
 * The intake statuses a row can carry before it becomes a purchase order.
 * A confirmed row shows its stage instead.
 */
export type IntakeStatus =
  | "EXTRACTING"
  | "NEEDS_REVIEW"
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
  FAILED: { label: "Failed", text: "text-accent-red", dot: "bg-accent-red" },
  NOT_CONFIRMED: {
    label: "Not confirmed",
    text: "text-ink-disabled",
    dot: "bg-ink-disabled",
  },
};

const PILL =
  "inline-flex shrink-0 items-center gap-xxs rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)]";

/**
 * Coloured text on `surface-soft`, never a coloured fill, and the label is
 * always present — colour alone never carries meaning.
 */
export function StatusBadge({ status }: { status: IntakeStatus }) {
  const { label, text } = INTAKE_STATUS[status];
  return <span className={`${PILL} ${text}`}>{label}</span>;
}

/**
 * The same pill once a PO is confirmed. Text is `ink` for the five stages in
 * progress and `accent-green` for Delivered; the 6px dot carries the stage's
 * ramp colour so the badge still reads at a glance (design reference §4).
 */
export function StageBadge({ stage }: { stage: PoStage }) {
  const delivered = stage === "DELIVERED";
  return (
    <span className={`${PILL} ${delivered ? "text-accent-green" : "text-ink"}`}>
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: `var(${stageColorVar(stage)})` }}
      />
      {stageLabel(stage)}
    </span>
  );
}
