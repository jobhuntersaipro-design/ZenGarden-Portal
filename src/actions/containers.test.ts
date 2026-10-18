import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  containerMedia: { findUnique: vi.fn(), update: vi.fn() },
  shipmentEvent: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/r2", () => ({ deleteObject: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
class UnauthorizedError extends Error {}
const requirePermission = vi.fn();
vi.mock("@/lib/auth-guards", () => ({ UnauthorizedError }));
vi.mock("@/lib/permissions/require", () => ({ requirePermission: (key: string) => requirePermission(key) }));

const { setContainerMediaNote } = await import("@/actions/containers");

beforeEach(() => {
  vi.resetAllMocks();
  requirePermission.mockResolvedValue({ id: "u1", name: "Chris", role: "WAREHOUSE" });
  db.containerMedia.findUnique.mockResolvedValue({ originalName: "IMG_6476.MOV", container: { shipmentId: "s1" } });
});

describe("setContainerMediaNote", () => {
  it("stores the note trimmed and logs it on the shipment", async () => {
    expect(await setContainerMediaNote({ id: "m1", note: "  Seal intact  " })).toEqual({ success: true, data: undefined });
    expect(db.containerMedia.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { note: "Seal intact" } });
    expect(db.shipmentEvent.create.mock.calls[0][0].data).toMatchObject({
      shipmentId: "s1",
      action: "CONTAINER_MEDIA_NOTE",
      text: "noted IMG_6476.MOV: Seal intact",
    });
  });

  it("clears the note when it is left blank", async () => {
    await setContainerMediaNote({ id: "m1", note: "   " });
    expect(db.containerMedia.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { note: null } });
  });

  it("refuses someone without shipment.manage", async () => {
    requirePermission.mockRejectedValue(new UnauthorizedError("You don't have permission to do that."));
    expect((await setContainerMediaNote({ id: "m1", note: "x" })).success).toBe(false);
    expect(db.containerMedia.update).not.toHaveBeenCalled();
  });
});
