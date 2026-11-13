import { describe, expect, it } from "vitest";
import {
  formDDefault,
  shipmentChecklist,
  shipmentReference,
} from "@/lib/shipments/checklist";

const states = (r: ReturnType<typeof shipmentChecklist>) =>
  Object.fromEntries(r.slots.map((s) => [s.key, s.state]));

describe("shipmentChecklist", () => {
  it("counts six: PO, booking, invoice, packing list, customs form and BL", () => {
    const empty = shipmentChecklist({ hasOrders: true, hasBooking: false, current: [], formDRequired: true });
    expect(empty.requiredTotal).toBe(6);
    expect(empty.requiredDone).toBe(1);
    expect(states(empty).INVOICE).toBe("missing");
  });

  it("keeps Form D, COA and KSO optional whatever the market, and never counts them", () => {
    const none = shipmentChecklist({ hasOrders: true, hasBooking: true, current: [], formDRequired: true });
    expect(states(none).FORM_D).toBe("optional");
    expect(states(none).COA).toBe("optional");
    expect(states(none).KSO).toBe("optional");
    const all = shipmentChecklist({ hasOrders: true, hasBooking: true, current: ["FORM_D", "COA", "KSO", "OTHER"], formDRequired: true });
    expect(states(all).COA).toBe("done");
    expect(all.requiredTotal).toBe(6);
    expect(all.requiredDone).toBe(none.requiredDone);
  });

  it("reads the golden shipment as 4 of 6", () => {
    const r = shipmentChecklist({ hasOrders: true, hasBooking: true, current: ["INVOICE", "PACKING_LIST"], formDRequired: false });
    expect(`${r.requiredDone} of ${r.requiredTotal}`).toBe("4 of 6");
  });

  it("is complete with every required paper", () => {
    const r = shipmentChecklist({
      hasOrders: true,
      hasBooking: true,
      current: ["INVOICE", "PACKING_LIST", "CUSTOMS_FORM", "BILL_OF_LADING"],
      formDRequired: true,
    });
    expect(r.requiredDone).toBe(r.requiredTotal);
    expect(r.status).toBe("complete");
    expect(r.reason).toBeNull();
  });

  it("walks the flow in the customer's order, with no slot for a typed-name paper", () => {
    const r = shipmentChecklist({ hasOrders: true, hasBooking: false, current: [], formDRequired: true });
    expect(r.slots.map((s) => s.key)).toEqual([
      "PURCHASE_ORDER", "BOOKING", "INVOICE", "PACKING_LIST", "CUSTOMS_FORM", "BILL_OF_LADING", "FORM_D", "COA", "KSO",
    ]);
  });

  it("names what is missing, in order, and carries no dates", () => {
    const r = shipmentChecklist({ hasOrders: true, hasBooking: true, current: ["PACKING_LIST"], formDRequired: true });
    expect(r.status).toBe("in_progress");
    expect(r.missing).toEqual(["INVOICE", "CUSTOMS_FORM", "BILL_OF_LADING"]);
    expect(r.reason).toBe("Missing: Invoice, Customs form, Bill of lading");
    expect(JSON.stringify(r)).not.toMatch(/due|late|\d{4}-\d{2}/i);
  });

  it("reads no booking before anything else", () => {
    expect(shipmentChecklist({ hasOrders: true, hasBooking: false, current: [], formDRequired: false }).status).toBe("no_booking");
  });
});

describe("formDDefault", () => {
  it("reads a destination or an Indonesian retailer", () => {
    expect(formDDefault("Indonesia")).toBe(true);
    expect(formDDefault("Super Indo")).toBe(true);
    expect(formDDefault("Vietnam")).toBe(false);
    expect(formDDefault(null)).toBe(false);
  });
});

describe("shipmentReference", () => {
  it("is SHP-YYMM-NNNN", () => {
    expect(shipmentReference(7, new Date("2026-10-16T03:00:00Z"))).toBe("SHP-2610-0007");
  });
});
