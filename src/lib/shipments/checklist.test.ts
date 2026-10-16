import { describe, expect, it } from "vitest";
import {
  formDDefault,
  shipmentChecklist,
  shipmentReference,
} from "@/lib/shipments/checklist";

const states = (r: ReturnType<typeof shipmentChecklist>) =>
  Object.fromEntries(r.slots.map((s) => [s.key, s.state]));

describe("shipmentChecklist", () => {
  it("counts the booking, packing list, customs form and BL, and Form D only when needed", () => {
    const empty = shipmentChecklist({ hasBooking: false, current: [], formDRequired: true });
    expect(empty.requiredTotal).toBe(5);
    expect(empty.requiredDone).toBe(0);
    const noD = shipmentChecklist({ hasBooking: false, current: [], formDRequired: false });
    expect(noD.requiredTotal).toBe(4);
    expect(states(noD).FORM_D).toBe("not_needed");
  });

  it("never calls the invoice missing, and never counts it", () => {
    const r = shipmentChecklist({ hasBooking: true, current: ["PACKING_LIST"], formDRequired: false });
    expect(states(r).INVOICE).toBe("optional");
    const withInvoice = shipmentChecklist({ hasBooking: true, current: ["PACKING_LIST", "INVOICE"], formDRequired: false });
    expect(states(withInvoice).INVOICE).toBe("done");
    expect(withInvoice.requiredDone).toBe(r.requiredDone);
  });

  it("is complete with every required paper", () => {
    const r = shipmentChecklist({
      hasBooking: true,
      current: ["PACKING_LIST", "CUSTOMS_FORM", "BILL_OF_LADING", "FORM_D"],
      formDRequired: true,
    });
    expect(r.requiredDone).toBe(r.requiredTotal);
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
