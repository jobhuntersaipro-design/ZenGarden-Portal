import { beforeEach, describe, expect, it, vi } from "vitest";

const productFindUnique = vi.fn();
const lineItemFindMany = vi.fn();
const webOrderLineFindMany = vi.fn();
const poCount = vi.fn();
const poAggregate = vi.fn();
const productFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findUnique: productFindUnique, findMany: productFindMany },
    lineItem: { findMany: lineItemFindMany },
    webOrderLine: { findMany: webOrderLineFindMany },
    purchaseOrder: { count: poCount, aggregate: poAggregate },
  },
}));

const { loadProduct } = await import("@/lib/queries/product-detail");

const presign = vi.fn(async (key: string) => `https://r2.test/${key}`);

beforeEach(() => {
  vi.clearAllMocks();
  productFindUnique.mockResolvedValue({
    id: "p1",
    sku: "ZEN-SC-1000-GM",
    name: "ZEN 1L — Goat's Milk",
    category: "Shower cream & gel",
    unit: "carton",
    brand: "Zen Garden",
    variant: "Goat's Milk",
    packSize: 12,
    cartonsPerPallet: 52,
    market: null,
    listPrice: { toNumber: () => 210 },
    description: null,
    active: true,
    needsReview: false,
    familyId: null,
    family: null,
    updatedAt: new Date("2026-09-15T00:00:00.000Z"),
    images: [],
    prices: [],
    _count: { lineItems: 0, webOrderLines: 0 },
  });
  lineItemFindMany.mockResolvedValue([]);
  webOrderLineFindMany.mockResolvedValue([]);
  poCount.mockResolvedValue(0);
  poAggregate.mockResolvedValue({ _sum: { total: null } });
  productFindMany.mockResolvedValue([]);
});

describe("loadProduct — open shop orders", () => {
  /**
   * A DRAFT is a client's live cart. Showing one on an ops screen would put a
   * basket nobody has sent in front of the team, so the status is pinned.
   */
  it("reads submitted shop orders only, newest first", async () => {
    await loadProduct("p1", presign);

    const call = webOrderLineFindMany.mock.calls[0][0];
    expect(call.where).toEqual({
      productId: "p1",
      webOrder: { status: "SUBMITTED" },
    });
    expect(call.orderBy).toEqual({ webOrder: { submittedAt: "desc" } });
  });

  it("returns one row per line, with the order behind it", async () => {
    webOrderLineFindMany.mockResolvedValue([
      {
        cartons: 4,
        webOrder: {
          id: "wo1",
          reference: "W-2609-00016",
          submittedAt: new Date("2026-09-15T02:00:00.000Z"),
          requestedDate: new Date("2026-09-30T00:00:00.000Z"),
          buyer: { name: "Acme Industrial Sdn Bhd" },
        },
      },
    ]);

    const data = await loadProduct("p1", presign);

    expect(data!.openShopOrders).toEqual([
      {
        id: "wo1",
        reference: "W-2609-00016",
        buyerName: "Acme Industrial Sdn Bhd",
        cartons: 4,
        submittedAt: "2026-09-15T02:00:00.000Z",
        requestedDate: "2026-09-30T00:00:00.000Z",
      },
    ]);
  });

  it("returns an empty list rather than null when there are none", async () => {
    const data = await loadProduct("p1", presign);
    expect(data!.openShopOrders).toEqual([]);
  });
});
