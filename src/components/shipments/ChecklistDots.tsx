import { cn } from "cn";
import { Badge, type BadgeTone } from "@/components/arc/badge/badge";
import { formatDate } from "@/lib/dates";
import { SLOT_LABEL, SLOT_SHORT } from "@/lib/shipments/checklist";
import { STATUS_LABEL, dueWords, type ShipmentStatus, type TrackedSlot, type TrackedState } from "@/lib/shipments/due";

/** The status palette (00-master §4): green done, amber due soon, red late. */
export const DOT: Record<TrackedState, string> = {
  done: "bg-accent-green border-accent-green",
  missing: "border-ink-tertiary bg-transparent",
  due_soon: "bg-brand-amber border-brand-amber",
  overdue: "bg-accent-red border-accent-red",
  optional: "border-hairline bg-transparent border-dashed",
  not_needed: "border-hairline bg-transparent border-dashed",
};

const SAYS: Record<TrackedState, string> = {
  done: "uploaded",
  missing: "missing",
  due_soon: "missing",
  overdue: "missing",
  optional: "optional",
  not_needed: "not needed",
};

/** "Bill of lading missing — due 21 Oct 2026, 3 days late". */
export function slotSentence(slot: TrackedSlot): string {
  const head = `${SLOT_LABEL[slot.key]} ${SAYS[slot.state]}`;
  if (!slot.dueOn) return head;
  return `${head} — due ${formatDate(slot.dueOn)}${slot.daysLeft !== null ? `, ${dueWords(slot.daysLeft)}` : ""}`;
}

/** One dot per paper, in the flow's order (Phase 63 §5, coloured by Phase 64). */
export function ChecklistDots({ slots, withLabels = false }: { slots: TrackedSlot[]; withLabels?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-xs" aria-label="Shipping documents">
      {slots.map((slot) => {
        const sentence = slotSentence(slot);
        return (
          <li key={slot.key} title={sentence} aria-label={sentence} className="flex items-center gap-xxs">
            <span aria-hidden className={cn("block size-2.5 rounded-full border-2", DOT[slot.state])} />
            {withLabels ? (
              <span aria-hidden className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">
                {SLOT_SHORT[slot.key]}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

const TONE: Record<ShipmentStatus, BadgeTone> = {
  overdue: "danger",
  due_soon: "warning",
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
