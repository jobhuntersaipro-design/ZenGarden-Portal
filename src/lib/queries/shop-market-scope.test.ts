import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every shop read is scoped to the signed-in buyer's market (2026-09-23).
 *
 * The type system already forces each query to *take* a market —
 * `shopVisible` requires one, so a caller that has not resolved an audience
 * cannot call it. What types cannot see is a query that takes the market and
 * then forgets to put it in the `where`, or one added later that builds its
 * own filter from scratch. This reads the `where` each shop read actually
 * sends to Prisma and refuses any that does not carry a market.
 *
 * It is the market counterpart of `shop-stock-leak.test.ts`: that one asserts
 * a column never leaves, this one asserts a filter never goes missing. Both
 * exist because the failure is silent — no type error, no crash, just another
 * market's catalogue on somebody's screen.
 */
const productFindMany = vi.fn();
const productFindFirst = vi.fn();
const productGroupBy = vi.fn();
const lineItemGroupBy = vi.fn();
const presignGet = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findMany: productFindMany,
      findFirst: productFindFirst,
      groupBy: productGroupBy,
    },
    lineItem: { groupBy: lineItemGroupBy },
  },
}));
vi.mock("@/lib/r2", () => ({ presignGet }));

const {
  listShopCategories,
  listShopProducts,
  loadShopProduct,
  relatedShopProducts,
  variantsOfProduct,
} = await import("@/lib/queries/shop-catalogue");
const { loadShopHome } = await import("@/lib/queries/shop-home");
const { parseShopQuery } = await import("@/lib/shop-filters");

const MARKET = "Vietnam";

beforeEach(() => {
  vi.resetAllMocks();
  presignGet.mockResolvedValue("https://r2.example/signed");
  productFindMany.mockResolvedValue([]);
  productFindFirst.mockResolvedValue(null);
  productGroupBy.mockResolvedValue([]);
  lineItemGroupBy.mockResolvedValue([]);
});

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

/**
 * Whether a `where` constrains the market, wherever it sits — directly, or
 * nested under the relation filter `groupBy` uses (`product: { market }`).
 */
function scopesMarket(where: unknown): boolean {
  if (typeof where !== "object" || where === null) return false;
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (key === "market" && value === MARKET) return true;
    if (value && typeof value === "object" && scopesMarket(value)) return true;
  }
  return false;
}

async function runEveryShopRead() {
  await listShopCategories(MARKET);
  await listShopProducts(parseShopQuery({}), MARKET);
  await listShopProducts(parseShopQuery({ q: "lavender", category: "Hair care" }), MARKET);
  await loadShopProduct("p1", MARKET);
  await variantsOfProduct(shopProduct, MARKET);
  await relatedShopProducts({ ...shopProduct, description: null, imageUrls: [] }, MARKET);
  await loadShopHome(MARKET);
}

describe("every shop read is scoped to the buyer's market", () => {
  it("puts the market in every product query the shop sends", async () => {
    await runEveryShopRead();

    const calls = [
      ...productFindMany.mock.calls,
      ...productFindFirst.mock.calls,
      ...productGroupBy.mock.calls,
    ];
    // A guard that asserted nothing because nothing ran would be worse than
    // no guard: it would read green while the shop leaked.
    expect(calls.length).toBeGreaterThan(5);

    for (const call of calls) {
      expect(scopesMarket(call[0]?.where)).toBe(true);
    }
  });

  it("scopes the best-seller roll-up through its product relation", async () => {
    // `lineItem.groupBy` reaches Product through a relation filter rather than
    // a top-level `where`, which is exactly the shape a scoping rule gets
    // written for the obvious queries and missed on.
    await loadShopHome(MARKET);

    expect(lineItemGroupBy.mock.calls.length).toBeGreaterThan(0);
    for (const call of lineItemGroupBy.mock.calls) {
      expect(scopesMarket(call[0]?.where)).toBe(true);
    }
  });

  it("never asks for a product carrying no market", async () => {
    await runEveryShopRead();

    const calls = [
      ...productFindMany.mock.calls,
      ...productFindFirst.mock.calls,
      ...productGroupBy.mock.calls,
      ...lineItemGroupBy.mock.calls,
    ];
    for (const call of calls) {
      // An `OR` admitting `{ market: null }` is the plausible wrong
      // implementation — "unmarketed products are the general catalogue" —
      // and it would pass every other assertion in this file.
      expect(JSON.stringify(call[0]?.where ?? {})).not.toContain('"market":null');
    }
  });
});
