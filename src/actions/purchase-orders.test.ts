import { beforeEach, describe, expect, it, vi } from "vitest";

const poFindUnique = vi.fn();
const extractionFindUnique = vi.fn();
const extractionDeleteMany = vi.fn();
const documentDelete = vi.fn();
const deleteObject = vi.fn();
const poDelete = vi.fn();
const extractionUpdateMany = vi.fn();

const tx = {
  purchaseOrder: { delete: poDelete },
  extraction: { updateMany: extractionUpdateMany, deleteMany: extractionDeleteMany },
  document: { delete: documentDelete },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrder: { findUnique: poFindUnique, delete: poDelete },
    extraction: {
      updateMany: extractionUpdateMany,
      findUnique: extractionFindUnique,
      deleteMany: extractionDeleteMany,
    },
    document: { delete: documentDelete },
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
vi.mock("@/lib/r2", () => ({
  deleteObject: (key: string) => deleteObject(key),
  isPendingKey: (key: string) => key.startsWith("pending:"),
}));
vi.mock("@/lib/extraction/resolve-products", () => ({
  resolveProducts: (lines: unknown[]) => Promise.resolve(lines.map(() => null)),
}));

const { deletePurchaseOrder, deleteUpload } = await import(
  "@/actions/purchase-orders"
);

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

describe("deleteUpload", () => {
  beforeEach(() => {
    extractionFindUnique.mockResolvedValue({
      id: "ex1",
      status: "SUCCEEDED",
      document: { id: "doc1", r2Key: "po/2026/09/doc1.pdf", originalName: "scan.pdf" },
    });
    extractionDeleteMany.mockResolvedValue({ count: 1 });
    documentDelete.mockResolvedValue({});
    deleteObject.mockResolvedValue(undefined);
  });

  it("removes the extraction, the document and the stored file", async () => {
    const result = await deleteUpload("ex1");
    expect(result.success).toBe(true);
    expect(extractionDeleteMany).toHaveBeenCalledWith({ where: { documentId: "doc1" } });
    expect(documentDelete).toHaveBeenCalledWith({ where: { id: "doc1" } });
    expect(deleteObject).toHaveBeenCalledWith("po/2026/09/doc1.pdf");
  });

  // A confirmed upload is a sales record behind a purchase order; deleting it
  // here would bypass the super-admin gate on deleting an order.
  it("refuses a confirmed upload", async () => {
    extractionFindUnique.mockResolvedValue({
      id: "ex1",
      status: "CONFIRMED",
      document: { id: "doc1", r2Key: "k", originalName: "scan.pdf" },
    });
    const result = await deleteUpload("ex1");
    expect(result.success).toBe(false);
    expect(documentDelete).not.toHaveBeenCalled();
  });

  it("fails cleanly when the upload is already gone", async () => {
    extractionFindUnique.mockResolvedValue(null);
    const result = await deleteUpload("ex1");
    expect(result.success).toBe(false);
    expect(documentDelete).not.toHaveBeenCalled();
  });

  // The row is what the user asked to remove; an object left behind in R2 is
  // cheaper than telling them the delete failed when the database is already
  // consistent.
  it("still succeeds when the stored file cannot be removed", async () => {
    deleteObject.mockRejectedValue(new Error("NoSuchKey"));
    const result = await deleteUpload("ex1");
    expect(result.success).toBe(true);
    expect(documentDelete).toHaveBeenCalled();
  });
});
