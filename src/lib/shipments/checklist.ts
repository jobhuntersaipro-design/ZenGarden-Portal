import type { ShipmentDocType, ShipmentMode } from "@/generated/prisma/enums";

/**
 * What a shipment still lacks (Phase 63, re-ordered 2026-10-17). Pure — no
 * Prisma — so the list, the shipment page and every PO's Shipping card read
 * one rule and cannot count differently. **No due dates** (asked for
 * 2026-10-17): a paper is uploaded, missing or optional. Six count — PO,
 * booking, invoice, packing list, customs form, BL; Form D, COA and KSO are
 * optional on every shipment (2026-11-13).
 */

/** OTHER is a paper with a typed name: no slot, never counted. */
export type SlotKey = "PURCHASE_ORDER" | "BOOKING" | Exclude<ShipmentDocType, "OTHER">;
export type SlotState = "done" | "missing" | "optional";

/** The export flow's own order, as the customer runs it. */
export const SLOT_ORDER: readonly SlotKey[] = [
  "PURCHASE_ORDER",
  "BOOKING",
  "INVOICE",
  "PACKING_LIST",
  "CUSTOMS_FORM",
  "BILL_OF_LADING",
  "FORM_D",
  "COA",
  "KSO",
];

/**
 * A land trip (2026-11-24): no booking and no bill of lading. PO, invoice and
 * packing list count; the customs form and the signed DO / POD are optional,
 * and border papers go in as "other" documents.
 */
export const LAND_SLOT_ORDER: readonly SlotKey[] = [
  "PURCHASE_ORDER",
  "INVOICE",
  "PACKING_LIST",
  "CUSTOMS_FORM",
  "DELIVERY_ORDER",
  "FORM_D",
  "COA",
  "KSO",
];

const LAND_OPTIONAL: ReadonlySet<SlotKey> = new Set(["CUSTOMS_FORM", "DELIVERY_ORDER", "FORM_D", "COA", "KSO"]);

export const slotOrder = (mode: ShipmentMode = "SEA") => (mode === "LAND" ? LAND_SLOT_ORDER : SLOT_ORDER);
export const isOptionalSlot = (key: SlotKey, mode: ShipmentMode = "SEA") =>
  (mode === "LAND" ? LAND_OPTIONAL : OPTIONAL_SLOTS).has(key);

/** For reference only (2026-11-13): shown, never counted toward "N of 6". */
export const OPTIONAL_SLOTS: ReadonlySet<SlotKey> = new Set(["FORM_D", "COA", "KSO"]);

export const SLOT_LABEL: Record<SlotKey, string> = {
  PURCHASE_ORDER: "Purchase order",
  BOOKING: "Booking confirmation",
  INVOICE: "Invoice",
  PACKING_LIST: "Packing list",
  CUSTOMS_FORM: "Customs form",
  BILL_OF_LADING: "Bill of lading",
  FORM_D: "Form D",
  COA: "COA",
  KSO: "KSO Inspection Documents",
  DELIVERY_ORDER: "Delivery order / POD",
};

/** Shorter, for a phone and a tight row. */
export const SLOT_SHORT: Record<SlotKey, string> = {
  PURCHASE_ORDER: "PO",
  BOOKING: "BC",
  INVOICE: "INV",
  PACKING_LIST: "PL",
  CUSTOMS_FORM: "K",
  BILL_OF_LADING: "BL",
  FORM_D: "D",
  COA: "COA",
  KSO: "KSO",
  DELIVERY_ORDER: "DO",
};

/** Who provides each paper, in the customer's words. */
export const SLOT_SOURCE: Record<SlotKey, string> = {
  PURCHASE_ORDER: "From the buyer",
  BOOKING: "From us or the buyer's forwarder",
  INVOICE: "From us",
  PACKING_LIST: "From us",
  CUSTOMS_FORM: "From customs — proof only",
  BILL_OF_LADING: "From the shipping line once the vessel departs, after it checks the invoice and packing list",
  FORM_D: "Optional · for reference",
  COA: "Optional · for reference",
  KSO: "Optional · for reference",
  DELIVERY_ORDER: "Optional · signed by the receiver",
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
  /** Kept on the shipment; no longer makes Form D count (2026-11-13). */
  formDRequired: boolean;
  mode?: ShipmentMode;
}) {
  const mode = input.mode ?? "SEA";
  const current = new Set<ShipmentDocType>(input.current);
  const counts = (key: SlotKey) => !isOptionalSlot(key, mode);
  const slots = slotOrder(mode).map((key): ChecklistSlot => {
    const done =
      key === "PURCHASE_ORDER" ? input.hasOrders : key === "BOOKING" ? input.hasBooking : current.has(key);
    if (done) return { key, state: "done" };
    if (!counts(key)) return { key, state: "optional" };
    return { key, state: "missing" };
  });
  // An optional paper never counts, even once uploaded.
  const required = slots.filter((slot) => counts(slot.key));
  const missing = slots.filter((slot) => slot.state === "missing").map((slot) => slot.key);
  const requiredDone = required.filter((slot) => slot.state === "done").length;
  const status: ShipmentStatus = missing.length === 0 ? "complete" : mode === "SEA" && !input.hasBooking ? "no_booking" : "in_progress";
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
export const CUSTOMS_LABELS = ["K1", "K2", "K3", "K4", "K5"] as const;

/** What a filed paper is called in a sentence: its slot, or the name typed for an "other" one. */
export const docPhrase = (d: { type: ShipmentDocType; label: string | null }) =>
  d.type === "OTHER" ? `document "${d.label ?? "Document"}"` : SLOT_LABEL[d.type].toLowerCase();

/** A filed paper's title on screen. */
export const docTitle = (d: { type: ShipmentDocType; label: string | null }) =>
  d.type === "OTHER" ? (d.label ?? "Document") : SLOT_LABEL[d.type];
