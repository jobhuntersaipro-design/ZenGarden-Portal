import type { ShipmentDocType } from "@/generated/prisma/enums";

/**
 * What a shipment still lacks (Phase 63, re-ordered 2026-10-17). Pure — no
 * Prisma — so the list, the shipment page and every PO's Shipping card read
 * one rule and cannot count differently. **No due dates** (asked for
 * 2026-10-17): a paper is uploaded, missing, optional or not needed.
 */

export type SlotKey = "PURCHASE_ORDER" | "BOOKING" | ShipmentDocType;
export type SlotState = "done" | "missing" | "optional" | "not_needed";

/** The export flow's own order, as the customer runs it. */
export const SLOT_ORDER: readonly SlotKey[] = [
  "PURCHASE_ORDER",
  "BOOKING",
  "INVOICE",
  "PACKING_LIST",
  "CUSTOMS_FORM",
  "BILL_OF_LADING",
  "FORM_D",
];

export const SLOT_LABEL: Record<SlotKey, string> = {
  PURCHASE_ORDER: "Purchase order",
  BOOKING: "Booking confirmation",
  INVOICE: "Invoice",
  PACKING_LIST: "Packing list",
  CUSTOMS_FORM: "Customs form",
  BILL_OF_LADING: "Bill of lading",
  FORM_D: "Form D",
};

/** Shorter, for a phone and a tight row. */
export const SLOT_SHORT: Record<SlotKey, string> = {
  PURCHASE_ORDER: "PO",
  BOOKING: "BC",
  INVOICE: "INV",
  PACKING_LIST: "PL",
  CUSTOMS_FORM: "K2",
  BILL_OF_LADING: "BL",
  FORM_D: "D",
};

/** Who provides each paper, in the customer's words. */
export const SLOT_SOURCE: Record<SlotKey, string> = {
  PURCHASE_ORDER: "From the buyer",
  BOOKING: "From us or the buyer's forwarder",
  INVOICE: "Optional",
  PACKING_LIST: "From us",
  CUSTOMS_FORM: "From customs — proof only",
  BILL_OF_LADING: "From the shipping line once the vessel departs, after it checks the invoice and packing list",
  FORM_D: "Issued by Zen Garden — upload only",
};

export type ShipmentStatus = "no_booking" | "in_progress" | "complete";

export const STATUS_LABEL: Record<ShipmentStatus, string> = {
  no_booking: "No booking",
  in_progress: "In progress",
  complete: "Complete",
};

/** Least done first: the order the list sorts by status. */
export const STATUS_ORDER: readonly ShipmentStatus[] = ["no_booking", "in_progress", "complete"];

export type ChecklistSlot = { key: SlotKey; state: SlotState };

export function shipmentChecklist(input: {
  hasOrders: boolean;
  hasBooking: boolean;
  current: ReadonlySet<ShipmentDocType> | readonly ShipmentDocType[];
  formDRequired: boolean;
}) {
  const current = new Set(input.current);
  const slots = SLOT_ORDER.map((key): ChecklistSlot => {
    const done =
      key === "PURCHASE_ORDER" ? input.hasOrders : key === "BOOKING" ? input.hasBooking : current.has(key);
    if (done) return { key, state: "done" };
    if (key === "INVOICE") return { key, state: "optional" };
    if (key === "FORM_D" && !input.formDRequired) return { key, state: "not_needed" };
    return { key, state: "missing" };
  });
  // The invoice is optional even once uploaded: it never counts.
  const required = slots.filter((slot) => slot.key !== "INVOICE" && slot.state !== "not_needed");
  const missing = slots.filter((slot) => slot.state === "missing").map((slot) => slot.key);
  const requiredDone = required.filter((slot) => slot.state === "done").length;
  const status: ShipmentStatus = missing.length === 0 ? "complete" : !input.hasBooking ? "no_booking" : "in_progress";
  return {
    slots,
    requiredDone,
    requiredTotal: required.length,
    missing,
    status,
    /** "Missing: Packing list, Customs form" — null once complete. */
    reason: missing.length ? `Missing: ${missing.map((key) => SLOT_LABEL[key]).join(", ")}` : null,
  };
}

export type Checklist = ReturnType<typeof shipmentChecklist>;

/**
 * Whether a new shipment needs a Form D, before anyone says. Form D lowers
 * Indonesian import duty, and a market is a destination *or* a retailer —
 * "Super Indo" is Indonesian — so this matches both, and stays a default:
 * the shipment carries its own answer.
 */
export const formDDefault = (market: string | null | undefined): boolean =>
  /indo/i.test(market ?? "");

/** SHP-YYMM-NNNN, from the shipment's own sequence. */
export function shipmentReference(seq: number, at: Date): string {
  const yymm = `${String(at.getUTCFullYear()).slice(2)}${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return `SHP-${yymm}-${String(seq).padStart(4, "0")}`;
}

/** The customs form's own name, when one was chosen. */
export const CUSTOMS_LABELS = ["K2", "K3", "K4"] as const;
