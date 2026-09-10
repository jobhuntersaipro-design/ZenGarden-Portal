import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopProductDetail } from "@/lib/queries/shop-catalogue";

const productFindMany = vi.fn();
const productCount = vi.fn();
const productGroupBy = vi.fn();
const presignGet = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findMany: productFindMany,
      count: productCount,
      groupBy: productGroupBy,
    },
  },
}));
vi.mock("@/lib/r2", () => ({ presignGet }));

const { listShopProducts, relatedShopProducts } = await import(
  "@/lib/queries/shop-catalogue"
);
const { parseShopQuery } = await import("@/lib/shop-filters");

beforeEach(() => {
  vi.resetAllMocks();
  presignGet.mockResolvedValue("https://r2.example/signed");
  productFindMany.mockResolvedValue([]);
  productCount.mockResolvedValue(0);
  productGroupBy.mockResolvedValue([]);
});

describe("listShopProducts — where", () => {
  it("filters the products query by brand, pack size and market as `in` clauses", async () => {
    const query = parseShopQuery({ brand: "ZEN GARDEN", pack: "12", market: "Vietnam" });
    await listShopProducts(query);

    const call = productFindMany.mock.calls.find((c) => !c[0].distinct);
    expect(call![0].where).toMatchObject({
      brand: { in: ["ZEN GARDEN"] },
      packSize: { in: [12] },
      market: { in: ["Vietnam"] },
    });
  });

  it("omits a facet's own filter from its groupBy while keeping the others", async () => {
    const query = parseShopQuery({ brand: "ZEN GARDEN", pack: "12", market: "Vietnam" });
    await listShopProducts(query);

    const brandsCall = productGroupBy.mock.calls.find(
      (c) => c[0].by[0] === "brand",
    );
    expect(brandsCall![0].where.brand).toBeUndefined();
    expect(brandsCall![0].where.packSize).toEqual({ in: [12] });
    expect(brandsCall![0].where.market).toEqual({ in: ["Vietnam"] });
  });
});

describe("listShopProducts — sort", () => {
  it("maps price-desc to listPrice desc then name asc", async () => {
    const query = parseShopQuery({ sort: "price-desc" });
    await listShopProducts(query);

    const call = productFindMany.mock.calls.find((c) => !c[0].distinct);
    expect(call![0].orderBy).toEqual([{ listPrice: "desc" }, { name: "asc" }]);
  });
});

describe("relatedShopProducts", () => {
  const product: ShopProductDetail = {
    id: "prd_1",
    sku: "ZEN-SC-2100-GM-VN",
    name: "ZEN 2.1L — Goat's Milk",
    brand: "ZEN GARDEN",
    variant: "Goat's Milk",
    category: "Shower cream & gel",
    market: "Vietnam",
    packSize: 6,
    unit: "carton",
    listPrice: "225.50",
    description: null,
    imageUrl: null,
    imageUrls: [],
  };

  it("matches the same brand and category, excludes the product itself, orders by name, takes 4", async () => {
    await relatedShopProducts(product);

    const call = productFindMany.mock.calls[0];
    expect(call[0].where).toEqual({
      active: true,
      needsReview: false,
      listPrice: { gt: 0 },
      brand: "ZEN GARDEN",
      category: "Shower cream & gel",
      id: { not: "prd_1" },
    });
    expect(call[0].orderBy).toEqual({ name: "asc" });
    expect(call[0].take).toBe(4);
  });

  it("matches on category alone when the product has no brand", async () => {
    await relatedShopProducts({ ...product, brand: null });

    const call = productFindMany.mock.calls[0];
    expect(call[0].where).toEqual({
      active: true,
      needsReview: false,
      listPrice: { gt: 0 },
      category: "Shower cream & gel",
      id: { not: "prd_1" },
    });
  });
});
