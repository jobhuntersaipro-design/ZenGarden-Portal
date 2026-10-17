import { describe, expect, it } from "vitest";
import {
  formDDefault,
  shipmentChecklist,
  shipmentReference,
} from "@/lib/shipments/checklist";

const states = (r: ReturnType<typeof shipmentChecklist>) =>
  Object.fromEntries(r.slots.map((s) => [s.key, s.state]));

describe("shipmentChecklist", () => {
  it("counts the PO, booking, packing list, customs form and BL, and Form D only when needed", () => {
    const empty = shipmentChecklist({ hasOrders: true, hasBooking: false, current: [], formDRequired: true });
    expect(empty.requiredTotal).toBe(6);
    expect(empty.requiredDone).toBe(1);
    const noD = shipmentChecklist({ hasOrders: true, hasBooking: false, current: [], formDRequired: false });
    expect(noD.requiredTotal).toBe(5);
    expect(states(noD).FORM_D).toBe("not_needed");
  });

  it("never calls the invoice missing, and never counts it", () => {
    const r = shipmentChecklist({ hasOrders: true, hasBooking: true, current: ["PACKING_LIST"], formDRequired: false });
    expect(states(r).INVOICE).toBe("optional");
    const withInvoice = shipmentChecklist({ hasOrders: true, hasBooking: true, current: ["PACKING_LIST", "INVOICE"], formDRequired: false });
    expect(states(withInvoice).INVOICE).toBe("done");
    expect(withInvoice.requiredDone).toBe(r.requiredDone);
  });

  it("is complete with every required paper", () => {
    const r = shipmentChecklist({
      hasOrders: true,
      hasBooking: true,
      current: ["PACKING_LIST", "CUSTOMS_FORM", "BILL_OF_LADING", "FORM_D"],
      formDRequired: true,
    });
    expect(r.requiredDone).toBe(r.requiredTotal);
    expect(r.status).toBe("complete");
    expect(r.reason).toBeNull();
  });

  it("walks the flow in the customer's order", () => {
    const r = shipmentChecklist({ hasOrders: true, hasBooking: false, current: [], formDRequired: true });
    expect(r.slots.map((s) => s.key)).toEqual([
      "PURCHASE_ORDER", "BOOKING", "INVOICE", "PACKING_LIST", "CUSTOMS_FORM", "BILL_OF_LADING", "FORM_D",
    ]);
  });

  it("names what is missing, in order, and carries no dates", () => {
    const r = shipmentChecklist({ hasOrders: true, hasBooking: true, current: ["PACKING_LIST"], formDRequired: true });
    expect(r.status).toBe("in_progress");
    expect(r.missing).toEqual(["CUSTOMS_FORM", "BILL_OF_LADING", "FORM_D"]);
    expect(r.reason).toBe("Missing: Customs form, Bill of lading, Form D");
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
