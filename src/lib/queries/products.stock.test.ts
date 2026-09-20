import { describe, expect, it, vi } from "vitest";

// `selectProducts` is pure, but it lives in a module that imports `prisma` —
// which validates the environment at import time. Nothing here reaches the
// database; the mock is only there to let the module load.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { selectProducts } = await import("@/lib/queries/products");
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

const product = (
  id: string,
  stockPieces: number | null,
  flags: ProductRow["flags"] = [],
): ProductRow => ({
  id,
  sku: id.toUpperCase(),
  name: id,
  family: null,
  category: "Shower cream & gel",
  unit: "carton",
  brand: null,
  variant: null,
  packSize: 6,
  market: null,
  listPrice: 10,
  stockPieces,
  active: true,
  imageCount: 1,
  thumbKey: null,
  stats,
  flags,
});

const order = (rows: ProductRow[], dir: "asc" | "desc") =>
  selectProducts(rows, { filter: null, sort: { key: "stock", dir } }).map((row) => row.id);

/**
 * A product nobody has counted is not a product with none of it. Sorting a
 * null as zero would fill the low end — the end a reader sorts to when they
 * want to know what is running out — with products that say nothing at all.
 */
describe("sorting products by stock", () => {
  const rows = [product("none", null), product("low", 12), product("high", 900)];

  it("puts the smallest count first ascending, with the uncounted last", () => {
    expect(order(rows, "asc")).toEqual(["low", "high", "none"]);
  });

  it("puts the largest count first descending, and still the uncounted last", () => {
    expect(order(rows, "desc")).toEqual(["high", "low", "none"]);
  });

  it("sorts a counted zero as the lowest count there is, not as a blank", () => {
    const withZero = [...rows, product("zero", 0)];
    expect(order(withZero, "asc")).toEqual(["zero", "low", "high", "none"]);
  });
});

describe("the low-stock chip", () => {
  it("returns the flagged products and nothing else", () => {
    const rows = [
      product("flagged", 12, ["low-stock"]),
      product("healthy", 900),
      product("uncounted", null),
    ];
    const selected = selectProducts(rows, {
      filter: "low-stock",
      sort: { key: "name", dir: "asc" },
    });
    expect(selected.map((row) => row.id)).toEqual(["flagged"]);
  });
});
