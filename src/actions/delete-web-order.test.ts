import { beforeEach, describe, expect, it, vi } from "vitest";

const webFindUnique = vi.fn();
const webDeleteMany = vi.fn();
const documentDelete = vi.fn();
const requireSuperAdmin = vi.fn();
const deleteObject = vi.fn();

class UnauthorizedError extends Error {}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webOrder: { findUnique: webFindUnique },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        webOrder: { deleteMany: webDeleteMany },
        document: { delete: documentDelete },
      }),
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError,
  requireSuperAdmin,
  requireUser: vi.fn(),
}));
const __permissionGuard = () => requireSuperAdmin();
// Phase 48: the actions ask the permission grid. It delegates to the guard
// mock above, so every test's existing setup still drives the refusal path.
const permissionKeys: string[] = [];
vi.mock("@/lib/permissions/require", () => ({
  requirePermission: (key: string) => {
    permissionKeys.push(key);
    return __permissionGuard();
  },
  rolesWithPermission: () => Promise.resolve([]),
  unauthorizedStatus: () => 403,
}));
vi.mock("@/lib/r2", () => ({
  deleteObject,
  isPendingKey: (key: string) => key.startsWith("pending:"),
}));
// Module-scope imports in web-orders.ts, mocked as its sibling tests do.
vi.mock("@/actions/purchase-orders", () => ({ writePurchaseOrder: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://www.example.com", SHOP_URL: "https://shop.example.com" },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/web-order-document", () => ({ attachWebOrderDocument: vi.fn() }));

const { deleteWebOrder } = await import("@/actions/web-orders");

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "sa1" });
  webFindUnique.mockResolvedValue({
    reference: "W-2609-00004",
    documentId: "doc1",
    document: { r2Key: "po/2026/09/doc1.pdf" },
  });
  webDeleteMany.mockResolvedValue({ count: 1 });
  documentDelete.mockResolvedValue({});
  deleteObject.mockResolvedValue(undefined);
});

describe("deleteWebOrder", () => {
  it("removes an open order, its generated file and the stored object", async () => {
    const result = await deleteWebOrder({
      id: "w1",
      typedReference: " w-2609-00004 ",
    });

    expect(result).toEqual({ success: true, data: undefined });
    // Guarded on the order still being open: a confirmed one is a sales record.
    expect(webDeleteMany).toHaveBeenCalledWith({
      where: { id: "w1", status: { in: ["SUBMITTED", "RECEIVED"] } },
    });
    expect(documentDelete).toHaveBeenCalledWith({ where: { id: "doc1" } });
    expect(deleteObject).toHaveBeenCalledWith("po/2026/09/doc1.pdf");
  });

  it("is refused to anyone but a super admin, and touches nothing", async () => {
    requireSuperAdmin.mockRejectedValue(
      new UnauthorizedError("This action needs super admin access."),
    );

    const result = await deleteWebOrder({ id: "w1", typedReference: "W-2609-00004" });

    expect(result).toEqual({
      success: false,
      error: "This action needs super admin access.",
    });
    expect(webDeleteMany).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("refuses a reference that was not typed back", async () => {
    const result = await deleteWebOrder({ id: "w1", typedReference: "W-2609-0000" });

    expect(result).toEqual({
      success: false,
      error: "That is not the Order ID.",
    });
    expect(webDeleteMany).not.toHaveBeenCalled();
  });

  it("leaves the file alone when the order was confirmed or declined meanwhile", async () => {
    webDeleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteWebOrder({ id: "w1", typedReference: "W-2609-00004" });

    expect(result).toEqual({
      success: false,
      error: "This one has already been reviewed.",
    });
    expect(documentDelete).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("deletes an order whose PDF was never drawn", async () => {
    webFindUnique.mockResolvedValue({
      reference: "W-2609-00004",
      documentId: null,
      document: null,
    });

    const result = await deleteWebOrder({ id: "w1", typedReference: "W-2609-00004" });

    expect(result.success).toBe(true);
    expect(documentDelete).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("still succeeds when the stored object cannot be removed", async () => {
    deleteObject.mockRejectedValue(new Error("R2 down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await deleteWebOrder({ id: "w1", typedReference: "W-2609-00004" });

    expect(result).toEqual({ success: true, data: undefined });
  });
});
