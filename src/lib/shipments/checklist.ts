import type { ShipmentDocType } from "@/generated/prisma/enums";

/**
 * What a shipment still lacks (Phase 63). Pure — no Prisma — so the list,
 * the shipment page and every PO's Shipping card read one rule and cannot
 * count differently. Phase 64 adds the due dates on top of this.
 */

export type SlotKey = "BOOKING" | ShipmentDocType;
export type SlotState = "done" | "missing" | "optional" | "not_needed";

/** The export flow's own order: booking, then the papers as they arrive. */
export const SLOT_ORDER: readonly SlotKey[] = [
  "BOOKING",
  "PACKING_LIST",
  "INVOICE",
  "CUSTOMS_FORM",
  "BILL_OF_LADING",
  "FORM_D",
];

export const SLOT_LABEL: Record<SlotKey, string> = {
  BOOKING: "Booking confirmation",
  PACKING_LIST: "Packing list",
  INVOICE: "Invoice",
  CUSTOMS_FORM: "Customs form",
  BILL_OF_LADING: "Bill of lading",
  FORM_D: "Form D",
};

/** Shorter, for a dot's tooltip and a phone. */
export const SLOT_SHORT: Record<SlotKey, string> = {
  BOOKING: "BC",
  PACKING_LIST: "PL",
  INVOICE: "INV",
  CUSTOMS_FORM: "K2",
  BILL_OF_LADING: "BL",
  FORM_D: "D",
};

export type ChecklistSlot = { key: SlotKey; state: SlotState };

export function shipmentChecklist(input: {
  hasBooking: boolean;
  current: ReadonlySet<ShipmentDocType> | readonly ShipmentDocType[];
  formDRequired: boolean;
}): { slots: ChecklistSlot[]; requiredDone: number; requiredTotal: number } {
  const current = new Set(input.current);
  const slots = SLOT_ORDER.map((key): ChecklistSlot => {
    const done = key === "BOOKING" ? input.hasBooking : current.has(key);
    if (done) return { key, state: "done" };
    // The invoice is for reference only: never "missing".
    if (key === "INVOICE") return { key, state: "optional" };
    if (key === "FORM_D" && !input.formDRequired) return { key, state: "not_needed" };
    return { key, state: "missing" };
  });
  const required = slots.filter(
    (slot) => slot.key !== "INVOICE" && !(slot.key === "FORM_D" && !input.formDRequired),
  );
  return {
    slots,
    requiredDone: required.filter((slot) => slot.state === "done").length,
    requiredTotal: required.length,
  };
}

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
