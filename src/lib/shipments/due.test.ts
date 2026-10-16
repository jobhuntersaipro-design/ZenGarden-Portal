import { describe, expect, it } from "vitest";
import { DOCUMENT_DUE_DAYS, trackShipment } from "@/lib/shipments/due";
import { klDay } from "@/lib/dates";

const base = {
  createdOn: "2026-10-01",
  etd: "2026-10-20",
  eta: "2026-10-30",
  hasBooking: true,
  current: [] as never[],
  formDRequired: true,
};
const slot = (r: ReturnType<typeof trackShipment>, key: string) => r.slots.find((s) => s.key === key)!;

describe("due dates", () => {
  it("anchors each slot to its rule", () => {
    const r = trackShipment({ ...base, today: "2026-10-01" });
    expect(slot(r, "PACKING_LIST").dueOn).toBe("2026-10-18");
    expect(slot(r, "CUSTOMS_FORM").dueOn).toBe("2026-10-20");
    expect(slot(r, "BILL_OF_LADING").dueOn).toBe("2026-10-25");
    expect(slot(r, "FORM_D").dueOn).toBe("2026-10-27");
    expect(slot(r, "INVOICE")).toMatchObject({ state: "optional", dueOn: null });
  });

  it.each([
    ["2026-10-24", "due_soon"],
    ["2026-10-25", "due_soon"],
    ["2026-10-26", "overdue"],
    ["2026-10-22", "due_soon"],
    ["2026-10-21", "missing"],
  ])("bill of lading on %s reads %s", (today, state) => {
    expect(slot(trackShipment({ ...base, today }), "BILL_OF_LADING").state).toBe(state);
  });

  it("is late the day after its due date, never on it", () => {
    expect(trackShipment({ ...base, today: "2026-10-18" }).status).toBe("due_soon");
    expect(trackShipment({ ...base, today: "2026-10-19" })).toMatchObject({
      status: "overdue",
      reason: "Packing list 1 day late",
    });
  });

  it("without a booking only the booking rule can fire", () => {
    const r = trackShipment({ ...base, hasBooking: false, etd: null, eta: null, today: "2026-10-03" });
    expect(r.status).toBe("no_booking");
    expect(slot(r, "BILL_OF_LADING").dueOn).toBeNull();
    expect(trackShipment({ ...base, hasBooking: false, etd: null, eta: null, today: "2026-10-09" }).status).toBe("overdue");
  });

  it("leaves Form D out when it is not needed", () => {
    const r = trackShipment({ ...base, formDRequired: false, today: "2026-11-30" });
    expect(slot(r, "FORM_D").state).toBe("not_needed");
    expect(r.requiredTotal).toBe(4);
  });

  it("is complete whatever the date once every required paper is in", () => {
    const r = trackShipment({
      ...base,
      current: ["PACKING_LIST", "CUSTOMS_FORM", "BILL_OF_LADING", "FORM_D"] as never[],
      today: "2027-01-01",
    });
    expect(r.status).toBe("complete");
  });

  it("reads the day in Kuala Lumpur, not UTC", () => {
    // 23:30 UTC on the 18th is 07:30 on the 19th in KL: the packing list is late.
    const today = klDay(new Date("2026-10-18T23:30:00Z"));
    expect(today).toBe("2026-10-19");
    expect(slot(trackShipment({ ...base, today }), "PACKING_LIST").state).toBe("overdue");
  });

  it("keeps the day counts in one place", () => {
    expect(DOCUMENT_DUE_DAYS.BILL_OF_LADING.days).toBe(5);
  });
});
