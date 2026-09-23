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
  // Three reads now share `product.findMany`, and two of them carry
  // `distinct` — brands (`["brand", "category"]`) and the category pictures
  // (`["category"]`) — so tests discriminate on its contents, never on its
  // presence. Each returns nothing unless a test overrides it.
  productFindMany.mockResolvedValue([]);
});

describe("loadShopHome — bestSellers", () => {
  it("orders best sellers by summed quantity over the window, filtered to SHOP_VISIBLE", async () => {
    lineItemGroupBy.mockResolvedValue([
      { productId: "p2", _sum: { quantity: dec("50") } },
      { productId: "p1", _sum: { quantity: dec("30") } },
    ]);
    // Returned deliberately out of id order, to prove the reorder is real.
    productFindMany.mockImplementation((args: { distinct?: string[]; where?: { id?: { in?: string[] } } }) => {
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
    expect(home.bestSellersAreFallback).toBe(false);

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
    expect(home.bestSellersAreFallback).toBe(true);

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
    productFindMany.mockImplementation((args: { distinct?: string[] }) => {
      if (args.distinct?.[0] === "brand") {
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

    const brandsCall = productFindMany.mock.calls.find(
      (call) => call[0].distinct?.[0] === "brand",
    );
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
      { name: "Body care", count: 4, imageUrl: null },
      { name: "Hair care", count: 9, imageUrl: null },
    ]);
    expect(productGroupBy.mock.calls[0][0]).toMatchObject({
      by: ["category"],
      where: { active: true, needsReview: false },
      orderBy: { category: "asc" },
    });
  });
});

describe("loadShopHome — category pictures", () => {
  const categoriesCall = () =>
    productFindMany.mock.calls.find((call) => call[0].distinct?.[0] === "category");

  it("asks only for products that actually carry an image, one per category", async () => {
    await loadShopHome();

    const call = categoriesCall();
    expect(call).toBeDefined();
    // The `some` is the point: a product with no photo can never supply one,
    // so a representative product without one would be a wasted row.
    expect(call![0].where).toMatchObject({
      active: true,
      needsReview: false,
      images: { some: {} },
    });
    expect(call![0].distinct).toEqual(["category"]);
  });

  it("hands each category its own product's signed thumbnail", async () => {
    productGroupBy.mockResolvedValue([
      { category: "Body care", _count: { _all: 4 } },
      { category: "Hair care", _count: { _all: 9 } },
    ]);
    productFindMany.mockImplementation((args: { distinct?: string[] }) => {
      if (args.distinct?.[0] === "category") {
        return Promise.resolve([
          { category: "Hair care", images: [{ thumbKey: "thumb/hair", r2Key: "full/hair" }] },
        ]);
      }
      return Promise.resolve([]);
    });
    presignGet.mockResolvedValue("https://r2.example/signed-hair");

    const home = await loadShopHome();

    expect(presignGet).toHaveBeenCalledWith("thumb/hair");
    expect(home.categories).toEqual([
      // No photographed product, so the tile draws its own mark.
      { name: "Body care", count: 4, imageUrl: null },
      { name: "Hair care", count: 9, imageUrl: "https://r2.example/signed-hair" },
    ]);
  });

  it("drops a category whose object will not presign rather than carrying a dead URL", async () => {
    productGroupBy.mockResolvedValue([{ category: "Hair care", _count: { _all: 9 } }]);
    productFindMany.mockImplementation((args: { distinct?: string[] }) => {
      if (args.distinct?.[0] === "category") {
        return Promise.resolve([
          { category: "Hair care", images: [{ thumbKey: null, r2Key: "full/hair" }] },
        ]);
      }
      return Promise.resolve([]);
    });
    presignGet.mockRejectedValue(new Error("gone"));

    const home = await loadShopHome();

    expect(home.categories).toEqual([{ name: "Hair care", count: 9, imageUrl: null }]);
  });
});
