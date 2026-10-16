import { shipmentChecklist, SLOT_LABEL, type SlotKey } from "@/lib/shipments/checklist";
import type { ShipmentDocType } from "@/generated/prisma/enums";

/**
 * When a shipping paper is due (Phase 64). Pure, no Prisma. Every date is a
 * Kuala Lumpur calendar day as `YYYY-MM-DD` and compared as a string — never
 * as a timestamp, which truncates to a UTC day (the `dateColumnRange` trap).
 *
 * **The day counts are defaults chosen here, not the customer's.** One line
 * each, to be confirmed with them.
 */
export const DOCUMENT_DUE_DAYS = {
  /** Days after the shipment was created. */
  BOOKING: { from: "created", days: 7 },
  PACKING_LIST: { from: "etd", days: -2 },
  CUSTOMS_FORM: { from: "etd", days: 0 },
  BILL_OF_LADING: { from: "etd", days: 5 },
  FORM_D: { from: "eta", days: -3 },
} as const satisfies Partial<Record<SlotKey, { from: "created" | "etd" | "eta"; days: number }>>;

/** Missing and due within this many days reads "due soon". */
export const DUE_SOON_DAYS = 3;

export type TrackedState = "done" | "missing" | "due_soon" | "overdue" | "optional" | "not_needed";
export type TrackedSlot = { key: SlotKey; state: TrackedState; dueOn: string | null; daysLeft: number | null };
export type ShipmentStatus = "overdue" | "due_soon" | "no_booking" | "in_progress" | "complete";

export const STATUS_LABEL: Record<ShipmentStatus, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  no_booking: "No booking",
  in_progress: "In progress",
  complete: "Complete",
};

/** Overdue first: the order the list sorts by status. */
export const STATUS_ORDER: readonly ShipmentStatus[] = ["overdue", "due_soon", "no_booking", "in_progress", "complete"];

const DAY_MS = 86_400_000;
const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export function trackShipment(input: {
  /** KL calendar day the shipment was created. */
  createdOn: string;
  /** The current booking's ETD / ETA, calendar days; null without one. */
  etd: string | null;
  eta: string | null;
  hasBooking: boolean;
  current: readonly ShipmentDocType[];
  formDRequired: boolean;
  /** Today in KL. */
  today: string;
}) {
  const base = shipmentChecklist(input);
  const anchors = { created: input.createdOn, etd: input.etd, eta: input.eta };
  const slots: TrackedSlot[] = base.slots.map((slot) => {
    const rule = (DOCUMENT_DUE_DAYS as Partial<Record<SlotKey, { from: keyof typeof anchors; days: number }>>)[slot.key];
    const anchor = rule ? anchors[rule.from] : null;
    const dueOn = rule && anchor ? addDays(anchor, rule.days) : null;
    if (slot.state !== "missing" || !dueOn) return { ...slot, dueOn: slot.state === "missing" ? dueOn : null, daysLeft: null };
    const daysLeft = daysBetween(input.today, dueOn);
    const state: TrackedState = daysLeft < 0 ? "overdue" : daysLeft <= DUE_SOON_DAYS ? "due_soon" : "missing";
    return { key: slot.key, state, dueOn, daysLeft };
  });
  const status: ShipmentStatus =
    base.requiredDone === base.requiredTotal
      ? "complete"
      : slots.some((s) => s.state === "overdue")
        ? "overdue"
        : slots.some((s) => s.state === "due_soon")
          ? "due_soon"
          : !input.hasBooking
            ? "no_booking"
            : "in_progress";
  return { slots, status, requiredDone: base.requiredDone, requiredTotal: base.requiredTotal, reason: reasonOf(slots) };
}

export type TrackedShipment = ReturnType<typeof trackShipment>;

/** "Bill of lading 3 days late" — the worst slot, in words. */
function reasonOf(slots: TrackedSlot[]): string | null {
  const worst = [...slots]
    .filter((s) => s.daysLeft !== null && (s.state === "overdue" || s.state === "due_soon"))
    .sort((a, b) => a.daysLeft! - b.daysLeft!)[0];
  return worst ? `${SLOT_LABEL[worst.key]} ${dueWords(worst.daysLeft!)}` : null;
}

/** "3 days late", "due today", "due in 2 days". */
export function dueWords(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft} ${daysLeft === -1 ? "day" : "days"} late`;
  if (daysLeft === 0) return "due today";
  return `due in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
}
