import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
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

const Decimal = Prisma.Decimal;

beforeEach(() => {
  vi.resetAllMocks();
  presignGet.mockResolvedValue("https://r2.example/signed");
  productFindMany.mockResolvedValue([]);
  productCount.mockResolvedValue(0);
  productGroupBy.mockResolvedValue([]);
});

/**
 * A catalogue row as the grouping read returns it. `listShopProducts` now
 * filters, facets and pages **in memory** over one narrow read, because a
 * card is a group whose key is partly derived (`groupName` strips a variant
 * suffix the importer appended) and the database cannot group on it. So these
 * assert what comes back, not what SQL went out.
 */
const row = (over: Record<string, unknown>) => ({
  id: "p1",
  sku: "SKU-1",
  name: "ZEN 2.1L",
  brand: "ZEN GARDEN",
  variant: null,
  packSize: 6,
  market: null,
  category: "Shower cream & gel",
  unit: "carton",
  listPrice: new Decimal("220.50"),
  images: [],
  ...over,
});

const variantRow = (variant: string, over: Record<string, unknown> = {}) =>
  row({
    id: `p-${variant}`,
    sku: `ZEN-${variant.toUpperCase()}`,
    name: `ZEN 2.1L — ${variant}`,
    variant,
    ...over,
  });

/** The grouping read comes first, then the page's own rows. */
const serveRows = (rows: ReturnType<typeof row>[]) => {
  productFindMany.mockImplementation((args: { where?: { id?: { in: string[] } } }) => {
    const ids = args.where?.id?.in;
    if (!ids) return Promise.resolve(rows);
    return Promise.resolve(rows.filter((r) => ids.includes(r.id)));
  });
};

describe("listShopProducts — grouping", () => {
  it("draws one card for a product sold in several flavours", async () => {
    serveRows([variantRow("Papaya"), variantRow("Goat's Milk"), variantRow("Carrot")]);

    const catalogue = await listShopProducts(parseShopQuery({}));

    expect(catalogue.total).toBe(1);
    expect(catalogue.groups).toHaveLength(1);
    expect(catalogue.groups[0].name).toBe("ZEN 2.1L");
    expect(catalogue.groups[0].variants.map((v) => v.variant)).toEqual([
      "Carrot",
      "Goat's Milk",
      "Papaya",
    ]);
  });

  it("keeps two pack sizes of the same product as two cards", async () => {
    serveRows([
      variantRow("Papaya"),
      variantRow("Papaya", { id: "p-big", sku: "ZEN-PP-12", packSize: 12 }),
    ]);

    const catalogue = await listShopProducts(parseShopQuery({}));
    expect(catalogue.total).toBe(2);
  });

  it("brackets a group's price and leaves the two equal when every flavour costs the same", async () => {
    serveRows([variantRow("Papaya"), variantRow("Carrot")]);

    const [group] = (await listShopProducts(parseShopQuery({}))).groups;
    expect({ from: group.priceFrom, to: group.priceTo }).toEqual({
      from: "220.50",
      to: "220.50",
    });
  });

  it("brackets a group whose flavours are priced apart", async () => {
    serveRows([
      variantRow("Papaya"),
      variantRow("Carrot", { listPrice: new Decimal("199.00") }),
    ]);

    const [group] = (await listShopProducts(parseShopQuery({}))).groups;
    expect({ from: group.priceFrom, to: group.priceTo }).toEqual({
      from: "199.00",
      to: "220.50",
    });
  });
});

describe("listShopProducts — filters", () => {
  it("puts category and the search term in the read, and no facet filter", async () => {
    serveRows([]);
    await listShopProducts(
      parseShopQuery({ category: "Shower cream & gel", q: "lavender", brand: "ZEN GARDEN" }),
    );

    const where = productFindMany.mock.calls[0][0].where;
    expect(where.category).toBe("Shower cream & gel");
    expect(where.OR).toHaveLength(4);
    // The facets are applied to the result, not to the query, or a facet
    // could not count what ticking it *would* return.
    expect(where.brand).toBeUndefined();
  });

  it("drops cards that do not match the ticked facets", async () => {
    serveRows([
      variantRow("Papaya"),
      variantRow("Kiwi", { id: "p-tl", sku: "TL-KW", brand: "Therapy Level", name: "H/WASH — Kiwi" }),
    ]);

    const catalogue = await listShopProducts(parseShopQuery({ brand: "Therapy Level" }));
    expect(catalogue.total).toBe(1);
    expect(catalogue.groups[0].brand).toBe("Therapy Level");
  });

  it("counts cards, not products, in a facet", async () => {
    serveRows([variantRow("Papaya"), variantRow("Carrot"), variantRow("Kiwi")]);

    const catalogue = await listShopProducts(parseShopQuery({}));
    // Three products, one card.
    expect(catalogue.facets.brands).toEqual([{ value: "ZEN GARDEN", count: 1 }]);
  });

  it("leaves a facet's own filter out of its counts while keeping the others", async () => {
    serveRows([
      variantRow("Papaya"),
      variantRow("Kiwi", { id: "p-tl", sku: "TL-KW", brand: "Therapy Level", name: "H/WASH — Kiwi" }),
      variantRow("Peach", { id: "p-big", sku: "TL-PC", brand: "Therapy Level", name: "H/WASH — Peach", packSize: 24 }),
    ]);

    const catalogue = await listShopProducts(
      parseShopQuery({ brand: "Therapy Level", pack: "6" }),
    );
    // Brands ignore the brand tick, so both are still offered; but they do
    // respect the pack tick, so the 24-pack Therapy Level card is excluded.
    expect(catalogue.facets.brands).toEqual([
      { value: "Therapy Level", count: 1 },
      { value: "ZEN GARDEN", count: 1 },
    ]);
  });
});

describe("listShopProducts — sort and paging", () => {
  it("orders cards by the cheapest flavour when asked for price ascending", async () => {
    serveRows([
      variantRow("Papaya"),
      variantRow("Kiwi", { id: "p-tl", sku: "TL-KW", brand: "Therapy Level", name: "H/WASH — Kiwi", listPrice: new Decimal("120.00") }),
    ]);

    const catalogue = await listShopProducts(parseShopQuery({ sort: "price-asc" }));
    expect(catalogue.groups.map((g) => g.name)).toEqual(["H/WASH", "ZEN 2.1L"]);
  });

  it("orders cards by name by default", async () => {
    serveRows([
      variantRow("Papaya"),
      variantRow("Kiwi", { id: "p-tl", sku: "TL-KW", brand: "Therapy Level", name: "H/WASH — Kiwi" }),
    ]);

    const catalogue = await listShopProducts(parseShopQuery({}));
    expect(catalogue.groups.map((g) => g.name)).toEqual(["H/WASH", "ZEN 2.1L"]);
  });

  it("asks the database for images only for the cards on this page", async () => {
    serveRows([variantRow("Papaya"), variantRow("Carrot")]);
    await listShopProducts(parseShopQuery({}));

    // By shape, not by index: `shopCategories` issues its own read alongside
    // the grouping one, so the ids read is neither first nor reliably second.
    const idsRead = productFindMany.mock.calls.find((c) => c[0].where?.id);
    expect([...idsRead![0].where.id.in].sort()).toEqual(["p-Carrot", "p-Papaya"]);
  });

  it("does not ask for any rows when the page is empty", async () => {
    serveRows([]);
    await listShopProducts(parseShopQuery({}));
    // One read for grouping, one for the categories, and nothing else.
    expect(productFindMany.mock.calls).toHaveLength(2);
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
    cartonsPerPallet: 60,
    unit: "carton",
    listPrice: "225.50",
    description: null,
    imageUrl: null,
    imageUrls: [],
  };

  it("matches the same brand and category, excludes the product itself and orders by name", async () => {
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
  });

  it("never offers a flavour the page's own variant picker already shows", async () => {
    const sibling = { ...row({ id: "sibling", sku: "ZEN-PP", name: "ZEN 2.1L — Papaya" }) };
    const other = { ...row({ id: "other", sku: "ZEN-OT", name: "ZEN 1L SCRUB" }) };
    productFindMany.mockResolvedValue([sibling, other]);

    const related = await relatedShopProducts(product, ["sibling"]);
    expect(related.map((r) => r.id)).toEqual(["other"]);
  });

  it("still returns at most four", async () => {
    productFindMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => row({ id: `r${i}`, sku: `SKU-${i}` })),
    );
    const related = await relatedShopProducts(product);
    expect(related).toHaveLength(4);
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
