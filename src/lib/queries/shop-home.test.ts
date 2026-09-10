import { beforeEach, describe, expect, it, vi } from "vitest";

const productGroupBy = vi.fn();
const productFindMany = vi.fn();
const lineItemGroupBy = vi.fn();
const presignGet = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { groupBy: productGroupBy, findMany: productFindMany },
    lineItem: { groupBy: lineItemGroupBy },
  },
}));
vi.mock("@/lib/r2", () => ({ presignGet }));

const { loadShopHome } = await import("@/lib/queries/shop-home");
const { Prisma } = await import("@/generated/prisma/client");

const dec = (v: string) => new Prisma.Decimal(v);

const productRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "p1",
  sku: "ZEN-SC-1000-GM-VN",
  name: "Zen Shower Cream 1L — Goat's Milk",
  brand: "ZEN GARDEN",
  variant: "Goat's Milk",
  category: "Shower cream & gel",
  packSize: 12,
  unit: "carton",
  listPrice: dec("189.00"),
  images: [],
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  productGroupBy.mockResolvedValue([]);
  lineItemGroupBy.mockResolvedValue([]);
  // Brands query (has `distinct`) returns nothing unless a test overrides it;
  // the best-seller/newest product query is distinguished per-call below.
  productFindMany.mockImplementation((args: { distinct?: unknown }) =>
    Promise.resolve(args.distinct ? [] : []),
  );
});

describe("loadShopHome — bestSellers", () => {
  it("orders best sellers by summed quantity over the window, filtered to SHOP_VISIBLE", async () => {
    lineItemGroupBy.mockResolvedValue([
      { productId: "p2", _sum: { quantity: dec("50") } },
      { productId: "p1", _sum: { quantity: dec("30") } },
    ]);
    // Returned deliberately out of id order, to prove the reorder is real.
    productFindMany.mockImplementation((args: { distinct?: unknown; where?: { id?: { in?: string[] } } }) => {
      if (args.distinct) return Promise.resolve([]);
      if (args.where?.id?.in) {
        return Promise.resolve([
          productRow({ id: "p1", sku: "P1" }),
          productRow({ id: "p2", sku: "P2" }),
        ]);
      }
      return Promise.resolve([]);
    });

    const home = await loadShopHome();
    expect(home.bestSellers.map((p) => p.id)).toEqual(["p2", "p1"]);

    const groupByArgs = lineItemGroupBy.mock.calls[0][0];
    expect(groupByArgs.where.productId).toEqual({ not: null });
    expect(groupByArgs.where.purchaseOrder.supersededBy).toBeNull();
    expect(groupByArgs.where.product).toMatchObject({
      active: true,
      needsReview: false,
    });
    expect(groupByArgs.take).toBe(4);
  });

  it("falls back to the newest four visible products when nothing has sold", async () => {
    lineItemGroupBy.mockResolvedValue([]);
    const newest = [
      productRow({ id: "n1", sku: "N1" }),
      productRow({ id: "n2", sku: "N2" }),
    ];
    productFindMany.mockImplementation((args: { distinct?: unknown; orderBy?: { createdAt?: string } }) => {
      if (args.distinct) return Promise.resolve([]);
      if (args.orderBy?.createdAt === "desc") return Promise.resolve(newest);
      return Promise.resolve([]);
    });

    const home = await loadShopHome();
    expect(home.bestSellers.map((p) => p.id)).toEqual(["n1", "n2"]);

    const fallbackCall = productFindMany.mock.calls.find(
      (call) => call[0].orderBy?.createdAt === "desc",
    );
    expect(fallbackCall).toBeDefined();
    expect(fallbackCall![0].where).toMatchObject({ active: true, needsReview: false });
    expect(fallbackCall![0].take).toBe(4);
  });
});

describe("loadShopHome — brands", () => {
  it("folds a category-sorted read into distinct brand → categories", async () => {
    productFindMany.mockImplementation((args: { distinct?: unknown }) => {
      if (args.distinct) {
        return Promise.resolve([
          { brand: "L.HANDS", category: "Dishwash & cleanser" },
          { brand: "L.HANDS", category: "Laundry detergent" },
          { brand: "MR. KING", category: "Body care" },
          { brand: "ZEN GARDEN", category: "Hair care" },
          { brand: "ZEN GARDEN", category: "Shower cream & gel" },
        ]);
      }
      return Promise.resolve([]);
    });

    const home = await loadShopHome();
    expect(home.brands).toEqual([
      { name: "L.HANDS", categories: ["Dishwash & cleanser", "Laundry detergent"] },
      { name: "MR. KING", categories: ["Body care"] },
      { name: "ZEN GARDEN", categories: ["Hair care", "Shower cream & gel"] },
    ]);

    const brandsCall = productFindMany.mock.calls.find((call) => call[0].distinct);
    expect(brandsCall).toBeDefined();
    expect(brandsCall![0].where).toMatchObject({ active: true, needsReview: false, brand: { not: null } });
    expect(brandsCall![0].distinct).toEqual(["brand", "category"]);
  });
});

describe("loadShopHome — categories", () => {
  it("maps groupBy rows to name/count pairs", async () => {
    productGroupBy.mockResolvedValue([
      { category: "Body care", _count: { _all: 4 } },
      { category: "Hair care", _count: { _all: 9 } },
    ]);

    const home = await loadShopHome();
    expect(home.categories).toEqual([
      { name: "Body care", count: 4 },
      { name: "Hair care", count: 9 },
    ]);
    expect(productGroupBy.mock.calls[0][0]).toMatchObject({
      by: ["category"],
      where: { active: true, needsReview: false },
      orderBy: { category: "asc" },
    });
  });
});
