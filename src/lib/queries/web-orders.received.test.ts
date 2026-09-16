import { beforeEach, describe, expect, it, vi } from "vitest";

const webFindMany = vi.fn();
const webFindFirst = vi.fn();
const poFindMany = vi.fn();
const poFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webOrder: { findMany: webFindMany, findFirst: webFindFirst },
    purchaseOrder: { findMany: poFindMany, findFirst: poFindFirst },
  },
}));

const { listBuyerOrders, loadBuyerOrder } = await import(
  "@/lib/queries/web-orders"
);

beforeEach(() => {
  vi.clearAllMocks();
  webFindMany.mockResolvedValue([]);
  webFindFirst.mockResolvedValue(null);
  poFindMany.mockResolvedValue([]);
  poFindFirst.mockResolvedValue(null);
});

/**
 * Pinned by equality, not by subset. A status filter that silently narrows is
 * how a buyer's own order disappears from their own list — no error, no type
 * failure, exactly the class of defect Phase 16 recorded when documentId
 * became nullable.
 */
const IN_FLIGHT = { in: ["SUBMITTED", "RECEIVED", "DECLINED"] };

describe("a buyer can still see an order the team has received", () => {
  it("listBuyerOrders asks for it", async () => {
    // listBuyerOrders(buyerId, page = 1, perPage = 20, sort?)
    await listBuyerOrders("b1");
    expect(webFindMany.mock.calls[0]![0].where.status).toEqual(IN_FLIGHT);
  });

  it("loadBuyerOrder asks for it", async () => {
    await loadBuyerOrder("b1", "w1");
    expect(webFindFirst.mock.calls[0]![0].where.status).toEqual(IN_FLIGHT);
  });

  it("labels a received order as received, not as submitted", async () => {
    webFindMany.mockResolvedValue([
      {
        id: "w1",
        reference: "W-2609-00001",
        submittedAt: new Date("2026-09-16"),
        subtotal: { toFixed: () => "15.00" },
        status: "RECEIVED",
        declinedReason: null,
        buyerReference: null,
        _count: { lines: 1 },
      },
    ]);
    const { orders } = await listBuyerOrders("b1");
    expect(orders[0]!.kind).toBe("received");
  });
});
