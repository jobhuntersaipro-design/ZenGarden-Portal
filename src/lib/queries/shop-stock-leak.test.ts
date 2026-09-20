import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stock is the ops team's own figure and no buyer may see it (2026-09-20).
 *
 * Every shop read selects its columns explicitly, so the way it would leak is
 * somebody adding `stockPieces` to one of those selects while wiring up
 * something else — no type error, no failing test, and a number on a
 * storefront. This reads the selects the shop actually sends to Prisma and
 * refuses the column anywhere inside them, however deeply nested.
 *
 * It asserts absence rather than a whole select's shape on purpose: pinning
 * each select by equality would fail on every unrelated column a future phase
 * adds, and the thing worth defending is this one column.
 */
const productFindMany = vi.fn();
const productCount = vi.fn();
const productGroupBy = vi.fn();
const lineItemGroupBy = vi.fn();
const presignGet = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: productFindMany, count: productCount, groupBy: productGroupBy },
    lineItem: { groupBy: lineItemGroupBy },
  },
}));
vi.mock("@/lib/r2", () => ({ presignGet }));

const { listShopProducts, variantsOfProduct, relatedShopProducts } = await import(
  "@/lib/queries/shop-catalogue"
);
const { loadShopHome } = await import("@/lib/queries/shop-home");
const { PRICED_PRODUCT_SELECT, PRICED_PRODUCT_SELECT_NO_IMAGES } = await import(
  "@/lib/queries/cart"
);
const { parseShopQuery } = await import("@/lib/shop-filters");

beforeEach(() => {
  vi.resetAllMocks();
  presignGet.mockResolvedValue("https://r2.example/signed");
  productFindMany.mockResolvedValue([]);
  productCount.mockResolvedValue(0);
  productGroupBy.mockResolvedValue([]);
  lineItemGroupBy.mockResolvedValue([]);
});

/** Every key of a Prisma select tree, nesting included. */
function keysOf(select: unknown, found: string[] = []): string[] {
  if (typeof select !== "object" || select === null) return found;
  for (const [key, value] of Object.entries(select as Record<string, unknown>)) {
    found.push(key);
    if (value && typeof value === "object") keysOf(value, found);
  }
  return found;
}

const selectsSent = () =>
  productFindMany.mock.calls.map((call) => call[0]?.select ?? call[0]);

describe("no shop read asks for stock", () => {
  it("leaves it out of the catalogue, a variant list and related products", async () => {
    const shopProduct = {
      id: "p1",
      sku: "ZEN-SC-2100-GM-VN",
      name: "Zen Garden Shower Cream 2.1L — Goat's Milk",
      familyId: "f1",
      familyName: "Zen Garden Shower Cream 2.1L",
      brand: "ZEN GARDEN",
      variant: "Goat's Milk",
      category: "Shower cream & gel",
      market: "Vietnam",
      packSize: 6,
      cartonsPerPallet: 52,
      unit: "carton",
      listPrice: "189.00",
      imageUrl: null,
    };

    await listShopProducts(parseShopQuery({}));
    await variantsOfProduct(shopProduct);
    await relatedShopProducts({ ...shopProduct, description: null, imageUrls: [] });

    expect(productFindMany.mock.calls.length).toBeGreaterThan(0);
    for (const select of selectsSent()) {
      expect(keysOf(select)).not.toContain("stockPieces");
    }
  });

  it("leaves it out of the shop home", async () => {
    await loadShopHome();

    expect(productFindMany.mock.calls.length).toBeGreaterThan(0);
    for (const select of selectsSent()) {
      expect(keysOf(select)).not.toContain("stockPieces");
    }
  });

  /**
   * The cart's selects are exported constants rather than a call this test can
   * intercept — they are what prices a buyer's own lines, on the cart page, at
   * checkout and on their order pages.
   */
  it("leaves it out of the cart's priced product selects", () => {
    expect(keysOf(PRICED_PRODUCT_SELECT)).not.toContain("stockPieces");
    expect(keysOf(PRICED_PRODUCT_SELECT_NO_IMAGES)).not.toContain("stockPieces");
  });
});
