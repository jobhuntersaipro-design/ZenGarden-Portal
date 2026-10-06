import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrderDocument: {
      findMany: (...args: unknown[]) => findMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

const { findBuyerOrderDocument, listBuyerOrderDocuments } = await import(
  "@/lib/queries/purchase-order-documents"
);

beforeEach(() => {
  vi.resetAllMocks();
  findMany.mockResolvedValue([]);
  findFirst.mockResolvedValue(null);
});

describe("listBuyerOrderDocuments", () => {
  it("reads only this buyer's order, and not account documents or the storage key", async () => {
    findMany.mockResolvedValue([
      {
        id: "doc-1",
        originalName: "spec.pdf",
        mimeType: "application/pdf",
        createdAt: new Date("2026-10-06T02:00:00.000Z"),
      },
    ]);

    const rows = await listBuyerOrderDocuments("buyer-a", "po-a");

    expect(findMany).toHaveBeenCalledExactlyOnceWith({
      where: { purchaseOrderId: "po-a", purchaseOrder: { buyerId: "buyer-a" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        createdAt: true,
      },
    });
    expect(JSON.stringify(findMany.mock.calls)).not.toMatch(/buyerDocument|r2Key|uploadedBy/i);
    expect(rows).toEqual([
      {
        id: "doc-1",
        name: "spec.pdf",
        mimeType: "application/pdf",
        preview: "pdf",
        createdAt: "2026-10-06T02:00:00.000Z",
      },
    ]);
  });
});

describe("findBuyerOrderDocument", () => {
  it("requires the file, the order and the buyer together", async () => {
    await findBuyerOrderDocument("buyer-a", "po-b", "doc-b");
    expect(findFirst).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: "doc-b",
        purchaseOrderId: "po-b",
        purchaseOrder: { buyerId: "buyer-a" },
      },
      select: { r2Key: true, mimeType: true, originalName: true },
    });
  });
});
