import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/r2";
import { SHOP_PER_PAGE, type ShopCatalogueQuery, type ShopSort } from "@/lib/shop-filters";

/**
 * What the shop shows.
 *
 * A product reaches the storefront only when it is `active`, past
 * `needsReview` and carries a real price. No new column expresses this: the
 * catalogue's existing *Needs review* chip is the same worklist, so pricing
 * the catalogue is what fills the shop.
 *
 * One consequence worth knowing: `updateProduct` clears `needsReview` on any
 * save, so correcting a typo publishes a product the moment it has a price.
 */
export const SHOP_VISIBLE = {
  active: true,
  needsReview: false,
  listPrice: { gt: 0 },
} satisfies Prisma.ProductWhereInput;

export type ShopProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  variant: string | null;
  category: string;
  market: string | null;
  packSize: number | null;
  unit: string;
  listPrice: string;
  imageUrl: string | null;
};

export type Facet<T extends string | number> = { value: T; count: number }[];

export type ShopCatalogue = {
  products: ShopProduct[];
  total: number;
  categories: string[];
  facets: { brands: Facet<string>; packSizes: Facet<number>; markets: Facet<string> };
};

/** `listShopProducts` takes the parsed query straight from `src/lib/shop-filters.ts`. */
export type ShopFilters = ShopCatalogueQuery;

/** A signed GET, or null when R2 is unreachable — the card shows a placeholder. */
export async function thumbUrl(
  images: { thumbKey: string | null; r2Key: string }[],
): Promise<string | null> {
  const first = images[0];
  if (!first) return null;
  try {
    return await presignGet(first.thumbKey ?? first.r2Key);
  } catch {
    return null;
  }
}

/** The categories a product in the shop actually carries, ascending. */
async function shopCategories(): Promise<string[]> {
  // The filter lists are built from what is *in the shop*, not from the whole
  // catalogue: offering a category with nothing behind it is a dead end.
  const categories = await prisma.product.findMany({
    where: SHOP_VISIBLE,
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return categories.map((c) => c.category);
}

/** Same list `listShopProducts` builds its filter chips from — exported for
 * the layout, which needs it before any product is loaded. */
export async function listShopCategories(): Promise<string[]> {
  return shopCategories();
}

const SHOP_PRODUCT_SELECT = {
  id: true,
  sku: true,
  name: true,
  brand: true,
  variant: true,
  category: true,
  market: true,
  packSize: true,
  unit: true,
  listPrice: true,
  images: {
    orderBy: { position: "asc" },
    take: 1,
    select: { thumbKey: true, r2Key: true },
  },
} satisfies Prisma.ProductSelect;

type ShopProductRow = Prisma.ProductGetPayload<{ select: typeof SHOP_PRODUCT_SELECT }>;

async function toShopProduct(row: ShopProductRow): Promise<ShopProduct> {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    variant: row.variant,
    category: row.category,
    market: row.market,
    packSize: row.packSize,
    unit: row.unit,
    listPrice: row.listPrice.toFixed(2),
    imageUrl: await thumbUrl(row.images),
  };
}

/**
 * The products `where`, or — passing `omit` — the same `where` minus one
 * facet's own filter. That is what makes a facet's counts answer "what would
 * I get if I also ticked this" rather than "what do I already have" (§5.3).
 */
function whereFor(
  query: ShopCatalogueQuery,
  omit?: "brands" | "packSizes" | "markets",
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { ...SHOP_VISIBLE };
  if (query.category) where.category = query.category;
  if (omit !== "brands" && query.brands.length) where.brand = { in: query.brands };
  if (omit !== "packSizes" && query.packSizes.length)
    where.packSize = { in: query.packSizes };
  if (omit !== "markets" && query.markets.length) where.market = { in: query.markets };
  const q = query.q?.trim();
  if (q) {
    // Name, brand and variant, so "vietnam" or "lavender" both find something.
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { variant: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

function orderByFor(sort: ShopSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ listPrice: "asc" }, { name: "asc" }];
    case "price-desc":
      return [{ listPrice: "desc" }, { name: "asc" }];
    default:
      return [{ name: "asc" }];
  }
}

function toFacet<T extends string | number>(
  rows: { count: number; value: T | null }[],
): Facet<T> {
  return rows.filter((row): row is { count: number; value: T } => row.value !== null);
}

export async function listShopProducts(
  query: ShopCatalogueQuery,
): Promise<ShopCatalogue> {
  const where = whereFor(query);
  const skip = (query.page - 1) * SHOP_PER_PAGE;

  const [rows, total, categories, brandRows, packSizeRows, marketRows] =
    await Promise.all([
      prisma.product.findMany({
        where,
        select: SHOP_PRODUCT_SELECT,
        orderBy: orderByFor(query.sort),
        skip,
        take: SHOP_PER_PAGE,
      }),
      prisma.product.count({ where }),
      shopCategories(),
      // Each facet's own `groupBy` runs against the where minus its own
      // filter, in the same Promise.all as the products and the count — one
      // round trip for the whole screen, not one per chip.
      prisma.product.groupBy({
        by: ["brand"],
        where: whereFor(query, "brands"),
        _count: { _all: true },
        orderBy: { brand: "asc" },
      }),
      prisma.product.groupBy({
        by: ["packSize"],
        where: whereFor(query, "packSizes"),
        _count: { _all: true },
        orderBy: { packSize: "asc" },
      }),
      prisma.product.groupBy({
        by: ["market"],
        where: whereFor(query, "markets"),
        _count: { _all: true },
        orderBy: { market: "asc" },
      }),
    ]);

  const products = await Promise.all(rows.map(toShopProduct));

  return {
    products,
    total,
    categories,
    facets: {
      brands: toFacet(brandRows.map((r) => ({ value: r.brand, count: r._count._all }))),
      packSizes: toFacet(
        packSizeRows.map((r) => ({ value: r.packSize, count: r._count._all })),
      ),
      markets: toFacet(marketRows.map((r) => ({ value: r.market, count: r._count._all }))),
    },
  };
}

export type ShopProductDetail = ShopProduct & {
  description: string | null;
  imageUrls: string[];
};

/**
 * Up to four other visible products sharing this product's category — the
 * product page's "More from {brand}" rail, matched on brand too when the
 * product carries one. A product with no brand relates on category alone,
 * and the page heads the section "You may also like" instead.
 */
export async function relatedShopProducts(
  product: ShopProductDetail,
): Promise<ShopProduct[]> {
  const where: Prisma.ProductWhereInput = {
    ...SHOP_VISIBLE,
    ...(product.brand ? { brand: product.brand } : {}),
    category: product.category,
    id: { not: product.id },
  };
  const rows = await prisma.product.findMany({
    where,
    select: SHOP_PRODUCT_SELECT,
    orderBy: { name: "asc" },
    take: 4,
  });
  return Promise.all(rows.map(toShopProduct));
}

export async function loadShopProduct(
  id: string,
): Promise<ShopProductDetail | null> {
  const row = await prisma.product.findFirst({
    // SHOP_VISIBLE here too: a product that is not in the shop has no page in
    // it either, so a guessed or bookmarked id 404s rather than leaking a
    // price that is not on offer.
    where: { id, ...SHOP_VISIBLE },
    select: {
      id: true,
      sku: true,
      name: true,
      brand: true,
      variant: true,
      category: true,
      market: true,
      packSize: true,
      unit: true,
      listPrice: true,
      description: true,
      images: {
        orderBy: { position: "asc" },
        select: { thumbKey: true, r2Key: true },
      },
    },
  });
  if (!row) return null;

  const imageUrls = (
    await Promise.all(row.images.map((image) => thumbUrl([image])))
  ).filter((url): url is string => Boolean(url));

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    variant: row.variant,
    category: row.category,
    market: row.market,
    packSize: row.packSize,
    unit: row.unit,
    listPrice: row.listPrice.toFixed(2),
    description: row.description,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
  };
}
