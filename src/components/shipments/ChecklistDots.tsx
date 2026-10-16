import { cn } from "cn";
import { SLOT_LABEL, SLOT_SHORT, type ChecklistSlot, type SlotState } from "@/lib/shipments/checklist";

const DOT: Record<SlotState, string> = {
  done: "bg-accent-green border-accent-green",
  missing: "border-ink-tertiary bg-transparent",
  optional: "border-hairline bg-transparent border-dashed",
  not_needed: "border-hairline bg-transparent border-dashed",
};

const SAYS: Record<SlotState, string> = {
  done: "uploaded",
  missing: "missing",
  optional: "optional",
  not_needed: "not needed",
};

/** One dot per paper, in the flow's order (Phase 63 §5). */
export function ChecklistDots({ slots, withLabels = false }: { slots: ChecklistSlot[]; withLabels?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-xs" aria-label="Shipping documents">
      {slots.map((slot) => {
        const sentence = `${SLOT_LABEL[slot.key]} ${SAYS[slot.state]}`;
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
