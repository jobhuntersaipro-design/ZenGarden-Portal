import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const remove = vi.fn();
const deleteObject = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrderDocument: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      delete: (...args: unknown[]) => remove(...args),
    },
  },
}));
vi.mock("@/lib/r2", () => ({
  deleteObject: (key: string) => deleteObject(key),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

class UnauthorizedError extends Error {}
const requirePermission = vi.fn();
vi.mock("@/lib/auth-guards", () => ({ UnauthorizedError }));
vi.mock("@/lib/permissions/require", () => ({
  requirePermission: (key: string) => requirePermission(key),
}));

const { deletePurchaseOrderDocument } = await import("@/actions/purchase-order-documents");

beforeEach(() => {
  vi.resetAllMocks();
  requirePermission.mockResolvedValue({ id: "u1", name: "Ada", role: "WAREHOUSE" });
  findFirst.mockResolvedValue(null);
  remove.mockResolvedValue({});
  deleteObject.mockResolvedValue(undefined);
});

describe("deletePurchaseOrderDocument", () => {
  it("refuses a buyer before it looks at the row", async () => {
    requirePermission.mockRejectedValue(new UnauthorizedError("This is not a portal account."));
    const result = await deletePurchaseOrderDocument({ id: "doc1", purchaseOrderId: "po-x" });
    expect(result).toEqual({ success: false, error: "This is not a portal account." });
    expect(findFirst).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses someone who is not signed in", async () => {
    requirePermission.mockRejectedValue(new UnauthorizedError("You are not signed in."));
    const result = await deletePurchaseOrderDocument({ id: "doc1", purchaseOrderId: "po-x" });
    expect(result).toEqual({ success: false, error: "You are not signed in." });
    expect(remove).not.toHaveBeenCalled();
  });

  it("asks for view and for attach", async () => {
    findFirst.mockResolvedValue({ r2Key: "orders/po-x/documents/a.pdf", purchaseOrderId: "po-x" });
    await deletePurchaseOrderDocument({ id: "doc1", purchaseOrderId: "po-x" });
    expect(requirePermission).toHaveBeenNthCalledWith(1, "po.view");
    expect(requirePermission).toHaveBeenNthCalledWith(2, "po.document");
  });

  it("removes only the file on this order", async () => {
    findFirst.mockResolvedValue({ r2Key: "orders/po-x/documents/a.pdf", purchaseOrderId: "po-x" });
    const result = await deletePurchaseOrderDocument({ id: "doc1", purchaseOrderId: "po-x" });
    expect(result.success).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "doc1", purchaseOrderId: "po-x" },
      select: { r2Key: true, purchaseOrderId: true },
    });
    expect(remove).toHaveBeenCalledExactlyOnceWith({ where: { id: "doc1" } });
    expect(deleteObject).toHaveBeenCalledExactlyOnceWith("orders/po-x/documents/a.pdf");
  });

  it("does nothing when the file belongs to another order", async () => {
    const result = await deletePurchaseOrderDocument({ id: "doc-y", purchaseOrderId: "po-x" });
    expect(result).toEqual({ success: false, error: "That file is gone." });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "doc-y", purchaseOrderId: "po-x" },
      select: { r2Key: true, purchaseOrderId: true },
    });
    expect(remove).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
