import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  shipmentDocument: { findFirst: vi.fn(), updateMany: vi.fn() },
  shipmentEvent: { create: vi.fn() },
  shipment: { update: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/r2", () => ({ deleteObject: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-guards", () => ({ UnauthorizedError: class extends Error {} }));
vi.mock("@/lib/permissions/require", () => ({ requirePermission: vi.fn(async () => ({ id: "u1", name: "Rina" })) }));

const { renameShipmentDocument, setCustomsLabel } = await import("@/actions/shipments");

beforeEach(() => {
  db.shipmentDocument.findFirst.mockReset();
  db.shipmentDocument.updateMany.mockReset();
  db.shipmentEvent.create.mockReset();
});

describe("renameShipmentDocument", () => {
  it("renames the paper and its earlier versions, and logs it", async () => {
    db.shipmentDocument.findFirst.mockResolvedValueOnce({ shipmentId: "s1", label: "Telex" }).mockResolvedValueOnce(null);
    expect(await renameShipmentDocument({ id: "d1", label: "  Telex release " })).toEqual({ success: true, data: undefined });
    expect(db.shipmentDocument.updateMany).toHaveBeenCalledWith({
      where: { shipmentId: "s1", type: "OTHER", label: "Telex" },
      data: { label: "Telex release" },
    });
    expect(db.shipmentEvent.create.mock.calls[0][0].data.text).toBe('renamed the document "Telex" to "Telex release"');
  });

  it("refuses a blank name, a long one and a name already taken", async () => {
    expect(await renameShipmentDocument({ id: "d1", label: "  " })).toEqual({ success: false, error: "Give the document a name." });
    expect(await renameShipmentDocument({ id: "d1", label: "x".repeat(81) })).toEqual({ success: false, error: "80 characters at most." });
    db.shipmentDocument.findFirst.mockResolvedValueOnce({ shipmentId: "s1", label: "Telex" }).mockResolvedValueOnce({ id: "d2" });
    expect(await renameShipmentDocument({ id: "d1", label: "Gate pass" })).toEqual({
      success: false,
      error: "Another document already has that name.",
    });
    expect(db.shipmentDocument.updateMany).not.toHaveBeenCalled();
  });
});

describe("setCustomsLabel", () => {
  it("takes K1 to K5 only", async () => {
    expect(await setCustomsLabel({ id: "d1", label: "K6" } as never)).toEqual({ success: false, error: "Choose K1 to K5." });
  });
});
