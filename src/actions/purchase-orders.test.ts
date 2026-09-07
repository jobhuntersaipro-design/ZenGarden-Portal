import { beforeEach, describe, expect, it, vi } from "vitest";

const poFindUnique = vi.fn();
const poDelete = vi.fn();
const extractionUpdateMany = vi.fn();

const tx = {
  purchaseOrder: { delete: poDelete },
  extraction: { updateMany: extractionUpdateMany },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrder: { findUnique: poFindUnique, delete: poDelete },
    extraction: { updateMany: extractionUpdateMany },
    $transaction: (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (client: typeof tx) => unknown)(tx)
        : Promise.resolve([]),
  },
}));

class UnauthorizedError extends Error {}
const requireSuperAdmin = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError,
  requireUser: vi.fn(),
  requireSuperAdmin: () => requireSuperAdmin(),
}));
// The action pulls in r2 and the extraction client transitively, both of which
// parse the environment at import time.
vi.mock("@/lib/env", () => ({
  env: { R2_BUCKET: "test", ANTHROPIC_API_KEY: "test", EXTRACTION_MODEL: "test" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { deletePurchaseOrder } = await import("@/actions/purchase-orders");

beforeEach(() => {
  vi.resetAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "u1", role: "SUPER_ADMIN" });
  poFindUnique.mockResolvedValue({
    id: "po1",
    poNumber: "PO-2026-0063",
    documentId: "doc1",
  });
  poDelete.mockResolvedValue({});
  extractionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("deletePurchaseOrder", () => {
  it("refuses anyone who is not a super admin, without deleting", async () => {
    requireSuperAdmin.mockRejectedValue(
      new UnauthorizedError("This action needs super admin access."),
    );
    const result = await deletePurchaseOrder({
      id: "po1",
      typedPoNumber: "PO-2026-0063",
    });
    expect(result.success).toBe(false);
    expect(poDelete).not.toHaveBeenCalled();
  });

  it("refuses a mismatched PO number, without deleting", async () => {
    const result = await deletePurchaseOrder({
      id: "po1",
      typedPoNumber: "PO-2026-006",
    });
    expect(result.success).toBe(false);
    expect(poDelete).not.toHaveBeenCalled();
  });

  it("accepts the number case-insensitively and trimmed", async () => {
    const result = await deletePurchaseOrder({
      id: "po1",
      typedPoNumber: "  po-2026-0063 ",
    });
    expect(result.success).toBe(true);
    expect(poDelete).toHaveBeenCalledWith({ where: { id: "po1" } });
  });

  it("returns the document to the review queue", async () => {
    await deletePurchaseOrder({ id: "po1", typedPoNumber: "PO-2026-0063" });
    expect(extractionUpdateMany).toHaveBeenCalledWith({
      where: { documentId: "doc1", status: "CONFIRMED" },
      data: { status: "SUCCEEDED" },
    });
  });

  it("fails cleanly when the order is already gone", async () => {
    poFindUnique.mockResolvedValue(null);
    const result = await deletePurchaseOrder({
      id: "po1",
      typedPoNumber: "PO-2026-0063",
    });
    expect(result.success).toBe(false);
    expect(poDelete).not.toHaveBeenCalled();
  });

  it("rejects an empty typed number without reading the order", async () => {
    const result = await deletePurchaseOrder({ id: "po1", typedPoNumber: "" });
    expect(result.success).toBe(false);
    expect(poFindUnique).not.toHaveBeenCalled();
  });
});
