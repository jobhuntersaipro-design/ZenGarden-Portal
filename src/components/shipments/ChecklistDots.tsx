import { Check } from "lucide-react";
import { cn } from "cn";
import { Badge, type BadgeTone } from "@/components/arc/badge/badge";
import {
  SLOT_LABEL,
  SLOT_SHORT,
  SLOT_SOURCE,
  STATUS_LABEL,
  type ChecklistSlot,
  type ShipmentStatus,
  type SlotState,
} from "@/lib/shipments/checklist";

/** Green uploaded, hollow missing, dashed optional or not needed. No due dates (2026-10-17). */
export const DOT: Record<SlotState, string> = {
  done: "bg-accent-green border-accent-green",
  missing: "border-ink-tertiary bg-transparent",
  optional: "border-hairline bg-transparent border-dashed",
  not_needed: "border-hairline bg-transparent border-dashed",
};

const SEGMENT: Record<SlotState, string> = {
  done: "bg-accent-green",
  missing: "bg-hairline-strong",
  optional: "border border-dashed border-hairline",
  not_needed: "border border-dashed border-hairline",
};

const SAYS: Record<SlotState, string> = {
  done: "Uploaded",
  missing: "Missing",
  optional: "Optional",
  not_needed: "Not needed",
};

export const slotSentence = (slot: ChecklistSlot) => `${SLOT_LABEL[slot.key]}: ${SAYS[slot.state].toLowerCase()}`;

/** The flow as one bar, a segment per step in order (PO → BC → … → Form D). For a row. */
export function ChecklistDots({ slots }: { slots: ChecklistSlot[] }) {
  return (
    <ol className="flex w-full max-w-56 gap-xxs" aria-label="Documents">
      {slots.map((slot) => {
        const sentence = slotSentence(slot);
        return (
          <li key={slot.key} title={sentence} aria-label={sentence} className={cn("h-2 flex-1 rounded-pill", SEGMENT[slot.state])} />
        );
      })}
    </ol>
  );
}

/**
 * Every step named, with what it is waiting on (2026-10-17). One column in a
 * narrow card or on a phone; the steps side by side once the box is 48rem.
 */
export function ShipmentProgress({ slots }: { slots: ChecklistSlot[] }) {
  return (
    <div className="@container min-w-0">
      <ol className="grid grid-cols-1 gap-xs @3xl:grid-cols-7 @3xl:gap-xxs" aria-label="Document progress">
        {slots.map((slot, index) => (
          <li key={slot.key} className="flex min-w-0 items-start gap-xs @3xl:flex-col @3xl:gap-xxs">
            <span className="hidden h-1.5 w-full rounded-pill @3xl:block" aria-hidden>
              <span className={cn("block h-full w-full rounded-pill", SEGMENT[slot.state])} />
            </span>
            <span
              aria-hidden
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[length:var(--text-caption)] tabular-nums @3xl:hidden",
                slot.state === "done" ? "border-accent-green bg-accent-green text-canvas" : DOT[slot.state],
                slot.state === "missing" ? "text-ink" : slot.state === "done" ? "" : "text-ink-tertiary",
              )}
            >
              {slot.state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[length:var(--text-body-sm)] text-ink">
                <span className="hidden font-mono text-ink-tertiary @3xl:inline">{index + 1} · </span>
                {SLOT_LABEL[slot.key]}
                <span className="sr-only"> — {SAYS[slot.state]}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "text-[length:var(--text-caption)]",
                  slot.state === "done" ? "text-ink-secondary" : slot.state === "missing" ? "text-ink" : "text-ink-tertiary",
                )}
              >
                {SAYS[slot.state]}
                <span className="font-mono"> · {SLOT_SHORT[slot.key]}</span>
              </span>
              {slot.state === "missing" ? (
                <span className="text-[length:var(--text-caption)] text-ink-tertiary">{SLOT_SOURCE[slot.key]}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const TONE: Record<ShipmentStatus, BadgeTone> = {
  no_booking: "neutral",
  in_progress: "info",
  complete: "success",
};

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <Badge tone={TONE[status]} size="sm" className="shrink-0">
      {STATUS_LABEL[status]}
    </Badge>
  );
}
