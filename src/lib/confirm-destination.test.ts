import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const can = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { shipment: { findFirst: (a: unknown) => findFirst(a) } } }));
vi.mock("@/lib/permissions/require", () => ({ can: (k: string) => can(k) }));

const { confirmDestination } = await import("./confirm-destination");

describe("confirmDestination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the shipment that already carries the PO", async () => {
    findFirst.mockResolvedValue({ id: "shp1" });
    expect(await confirmDestination("po1")).toBe("/shipments/shp1");
    expect(findFirst.mock.calls[0][0].where).toEqual({ orders: { some: { purchaseOrderId: "po1" } } });
  });

  it("opens the new-shipment form with the PO ticked when none does", async () => {
    findFirst.mockResolvedValue(null);
    can.mockResolvedValue(true);
    expect(await confirmDestination("po1")).toBe("/shipments/new?po=po1");
    expect(can).toHaveBeenCalledWith("shipment.manage");
  });

  it("stays on the PO for someone who cannot make a shipment", async () => {
    findFirst.mockResolvedValue(null);
    can.mockResolvedValue(false);
    expect(await confirmDestination("po1")).toBeNull();
  });
});
