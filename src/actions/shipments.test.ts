import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  purchaseOrder: { findMany: vi.fn(), findUnique: vi.fn() },
  shipment: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  shipmentOrder: { createMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
  shipmentEvent: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  bookingConfirmation: { updateMany: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (work: (t: typeof tx) => unknown) => work(tx), shipmentEvent: tx.shipmentEvent },
}));
vi.mock("@/lib/r2", () => ({ deleteObject: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
class UnauthorizedError extends Error {}
const requirePermission = vi.fn();
vi.mock("@/lib/auth-guards", () => ({ UnauthorizedError }));
vi.mock("@/lib/permissions/require", () => ({ requirePermission: (key: string) => requirePermission(key) }));

const { addOrdersToShipment, addShipmentNote, createShipment, deleteShipmentNote, editShipmentNote, linkBookingToShipment, removeOrderFromShipment } = await import(
  "@/actions/shipments"
);

const po = (id: string) => ({ id, poNumber: `PO-${id}`, buyerReference: null, webOrder: null });

beforeEach(() => {
  vi.resetAllMocks();
  requirePermission.mockResolvedValue({ id: "u1", name: "Rina", role: "WAREHOUSE" });
  tx.shipment.create.mockResolvedValue({ id: "s1", seq: 7, createdAt: new Date("2026-10-16T03:00:00Z") });
});

describe("createShipment", () => {
  it("refuses an order of another buyer and writes nothing", async () => {
    // The query is scoped to the buyer, so B's order does not come back.
    tx.purchaseOrder.findMany.mockResolvedValue([po("a1")]);
    const result = await createShipment({
      buyerId: "A",
      purchaseOrderIds: ["a1", "b1"],
      market: "Indonesia",
      formDRequired: true,
    });
    expect(result).toEqual({ success: false, error: "Every order on a shipment must be the same buyer's." });
    expect(tx.purchaseOrder.findMany.mock.calls[0][0].where).toMatchObject({ buyerId: "A" });
    expect(tx.shipment.create).not.toHaveBeenCalled();
  });

  it("mints SHP-YYMM-NNNN from the sequence and logs who made it", async () => {
    tx.purchaseOrder.findMany.mockResolvedValue([po("a1"), po("a2")]);
    const result = await createShipment({ buyerId: "A", purchaseOrderIds: ["a1", "a2"], formDRequired: false });
    expect(result).toEqual({ success: true, data: { id: "s1" } });
    expect(tx.shipment.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { reference: "SHP-2610-0007" } });
    expect(tx.shipmentEvent.create.mock.calls[0][0].data).toMatchObject({ actorName: "Rina", action: "SHIPMENT_CREATED" });
  });

  it("needs at least one order", async () => {
    const result = await createShipment({ buyerId: "A", purchaseOrderIds: [], formDRequired: false });
    expect(result).toEqual({ success: false, error: "Choose at least one order." });
  });

  it("refuses a member, who holds no shipment.manage", async () => {
    requirePermission.mockRejectedValue(new UnauthorizedError("You don't have permission to do that."));
    const result = await createShipment({ buyerId: "A", purchaseOrderIds: ["a1"], formDRequired: false });
    expect(result.success).toBe(false);
    expect(tx.purchaseOrder.findMany).not.toHaveBeenCalled();
  });
});

describe("addOrdersToShipment", () => {
  it("refuses another buyer's order", async () => {
    tx.shipment.findUnique.mockResolvedValue({ buyerId: "A" });
    tx.purchaseOrder.findMany.mockResolvedValue([]);
    const result = await addOrdersToShipment({ shipmentId: "s1", purchaseOrderIds: ["b1"] });
    expect(result.success).toBe(false);
    expect(tx.shipmentOrder.createMany).not.toHaveBeenCalled();
  });
});

describe("removeOrderFromShipment", () => {
  it("refuses the last order", async () => {
    tx.shipmentOrder.count.mockResolvedValue(1);
    const result = await removeOrderFromShipment({ shipmentId: "s1", purchaseOrderId: "a1" });
    expect(result.success).toBe(false);
    expect(tx.shipmentOrder.deleteMany).not.toHaveBeenCalled();
  });
});

describe("linkBookingToShipment", () => {
  it("is allowed with bc.review when shipment.manage is not held", async () => {
    requirePermission.mockImplementation(async (key: string) => {
      if (key === "shipment.manage") throw new UnauthorizedError("no");
      return { id: "u2", name: "Aisha", role: "SUPER_ADMIN" };
    });
    const before = { shipmentId: null, bookingNumber: "BK1", originalName: "bk.pdf" };
    const t = tx as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
    t.bookingConfirmation.findUnique = vi.fn().mockResolvedValue(before);
    t.bookingConfirmation.update = vi.fn().mockResolvedValue({});
    tx.shipment.findUnique.mockResolvedValue({ id: "s1" });
    const result = await linkBookingToShipment({ bookingId: "b1", shipmentId: "s1" });
    expect(result).toEqual({ success: true, data: undefined });
    expect(requirePermission).toHaveBeenCalledWith("bc.review");
  });
});

describe("addShipmentNote", () => {
  it("writes one NOTE row with the note, who and the shipment", async () => {
    const result = await addShipmentNote({ shipmentId: "s1", text: "  Forwarder wants the BL by Friday  " });
    expect(result).toEqual({ success: true, data: undefined });
    expect(tx.shipmentEvent.create).toHaveBeenCalledWith({
      data: { shipmentId: "s1", actorId: "u1", actorName: "Rina", action: "NOTE", text: "Forwarder wants the BL by Friday" },
    });
  });

  it("refuses a blank note and writes nothing", async () => {
    const result = await addShipmentNote({ shipmentId: "s1", text: "   " });
    expect(result).toEqual({ success: false, error: "Write the note first." });
    expect(tx.shipmentEvent.create).not.toHaveBeenCalled();
  });

  it("refuses a member, who holds no shipment.manage", async () => {
    requirePermission.mockRejectedValue(new UnauthorizedError("You don't have permission to do that."));
    expect((await addShipmentNote({ shipmentId: "s1", text: "hi" })).success).toBe(false);
    expect(tx.shipmentEvent.create).not.toHaveBeenCalled();
  });
});

describe("editing and deleting a note", () => {
  const note = (actorId: string, action = "NOTE") => ({ shipmentId: "s1", action, actorId });

  it("lets the author edit their note, stamping editedAt and logging it", async () => {
    tx.shipmentEvent.findUnique.mockResolvedValue(note("u1"));
    const result = await editShipmentNote({ id: "n1", text: "  BL due Monday  " });
    expect(result).toEqual({ success: true, data: undefined });
    expect(tx.shipmentEvent.update).toHaveBeenCalledWith({
      where: { id: "n1" },
      data: { text: "BL due Monday", editedAt: expect.any(Date) },
    });
    expect(tx.shipmentEvent.create.mock.calls[0][0].data).toMatchObject({ action: "NOTE_EDITED", text: "edited a note" });
  });

  it("refuses someone else's note, unless they are a super admin", async () => {
    tx.shipmentEvent.findUnique.mockResolvedValue(note("u2"));
    expect(await deleteShipmentNote({ id: "n1" })).toEqual({
      success: false,
      error: "Only the person who wrote a note can change it.",
    });
    expect(tx.shipmentEvent.delete).not.toHaveBeenCalled();

    requirePermission.mockResolvedValue({ id: "u9", name: "Aisha", role: "SUPER_ADMIN" });
    expect((await deleteShipmentNote({ id: "n1" })).success).toBe(true);
    expect(tx.shipmentEvent.delete).toHaveBeenCalledWith({ where: { id: "n1" } });
  });

  it("never touches an activity row through the note actions", async () => {
    tx.shipmentEvent.findUnique.mockResolvedValue(note("u1", "SHIPMENT_CREATED"));
    expect((await editShipmentNote({ id: "n1", text: "x" })).success).toBe(false);
    expect((await deleteShipmentNote({ id: "n1" })).success).toBe(false);
    expect(tx.shipmentEvent.update).not.toHaveBeenCalled();
    expect(tx.shipmentEvent.delete).not.toHaveBeenCalled();
  });
});
