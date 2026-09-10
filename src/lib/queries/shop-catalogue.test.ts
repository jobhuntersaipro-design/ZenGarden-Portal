import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { listShopProducts } = await import("@/lib/queries/shop-catalogue");
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
    expect(brandsCall![0].where.brand).not.toEqual({ in: ["ZEN GARDEN"] });
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
