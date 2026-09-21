import { describe, expect, it, vi } from "vitest";

// `selectProducts` is pure, but its module imports `prisma`, which validates
// the environment at import time. Nothing here reaches the database.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { selectProducts } = await import("@/lib/queries/products");
const { NO_MARKET } = await import("@/lib/product-markets");
type ProductRow = import("@/lib/queries/products").ProductRow;

const stats: ProductRow["stats"] = {
  revenue: 0,
  units: 0,
  orders: 0,
  buyers: 0,
  unitsPerOrder: 0,
  avgBilled: 0,
  vsListPercent: 0,
  driftPercent: null,
  velocity: 0,
  attachRate: 0,
  firstSold: null,
  lastSold: null,
};

const product = (id: string, market: string | null): ProductRow => ({
  id,
  sku: id.toUpperCase(),
  name: id,
  family: null,
  category: "Shower cream & gel",
  unit: "carton",
  brand: "Zen Garden",
  variant: null,
  packSize: 6,
  market,
  listPrice: 10,
  stockCartons: null,
  active: true,
  imageCount: 1,
  thumbKey: null,
  stats,
  flags: [],
});

const sort = { key: "name", dir: "asc" } as const;
const ids = (rows: ProductRow[]) => rows.map((row) => row.id);

const catalogue = [
  product("vietnam-a", "Vietnam"),
  product("vietnam-b", "Vietnam"),
  product("mydin", "Mydin"),
  product("unplaced", null),
];

/**
 * A product's market is its destination or its retail customer — never where
 * it was made (`context/project-overview.md`), which is why "Mydin" sits in
 * the same list as "Vietnam".
 */
describe("filtering products by market", () => {
  it("keeps only the products sold into it", () => {
    const rows = selectProducts(catalogue, { market: "Vietnam", filter: null, sort });
    expect(ids(rows)).toEqual(["vietnam-a", "vietnam-b"]);
  });

  it("leaves every product where no market is asked for", () => {
    const rows = selectProducts(catalogue, { filter: null, sort });
    expect(rows).toHaveLength(4);
  });

  it("never matches a product carrying no market, whichever market is asked for", () => {
    // A product with none is not in a market called nothing, so no value of
    // the filter reaches it…
    for (const market of ["Vietnam", "Mydin", "Nowhere"]) {
      const rows = selectProducts(catalogue, { market, filter: null, sort });
      expect(ids(rows), market).not.toContain("unplaced");
    }
    // …and "All markets" — which arrives as no filter at all — is how you
    // ask for it back.
    expect(ids(selectProducts(catalogue, { market: undefined, filter: null, sort })))
      .toContain("unplaced");
  });

  it("narrows alongside the other filters rather than replacing them", () => {
    const mixed = [
      { ...product("keep", "Vietnam"), category: "Hand wash & soap" },
      { ...product("wrong-category", "Vietnam"), category: "Shower cream & gel" },
      { ...product("wrong-market", "Mydin"), category: "Hand wash & soap" },
    ];
    const rows = selectProducts(mixed, {
      market: "Vietnam",
      category: "Hand wash & soap",
      filter: null,
      sort,
    });
    expect(ids(rows)).toEqual(["keep"]);
  });
});

/**
 * The market view's remainder row links here, and it is the one way to ask
 * for the products the filter above can never reach.
 */
describe("asking for the products carrying no market", () => {
  it("returns exactly those, and no product that has one", () => {
    const rows = selectProducts(catalogue, {
      market: NO_MARKET,
      filter: null,
      sort,
    });
    expect(ids(rows)).toEqual(["unplaced"]);
  });

  it("is a sentinel no market label could be, unlike a plain \"none\"", () => {
    // A market is free text typed into a growing list, so `none` is a
    // plausible thing to write and would then be unreachable behind its own
    // sentinel. `*none` is not.
    const named = [product("really-none", "none"), product("unplaced", null)];
    expect(ids(selectProducts(named, { market: "none", filter: null, sort }))).toEqual([
      "really-none",
    ]);
    expect(ids(selectProducts(named, { market: NO_MARKET, filter: null, sort }))).toEqual(
      ["unplaced"],
    );
  });

  it("narrows alongside the other filters, like any other market", () => {
    const mixed = [
      { ...product("keep", null), category: "Hand wash & soap" },
      { ...product("wrong-category", null), category: "Shower cream & gel" },
      { ...product("has-a-market", "Vietnam"), category: "Hand wash & soap" },
    ];
    const rows = selectProducts(mixed, {
      market: NO_MARKET,
      category: "Hand wash & soap",
      filter: null,
      sort,
    });
    expect(ids(rows)).toEqual(["keep"]);
  });
});
