import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { groupProducts, type ProductGroup } from "@/lib/product-groups";
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
  /** The product this is a variant of, where ops has placed it (Phase 36). */
  familyId: string | null;
  familyName: string | null;
  brand: string | null;
  variant: string | null;
  category: string;
  market: string | null;
  packSize: number | null;
  /** Widened on purpose in Phase 29: buyers plan full-pallet orders. */
  cartonsPerPallet: number | null;
  unit: string;
  listPrice: string;
  imageUrl: string | null;
};

export type Facet<T extends string | number> = { value: T; count: number }[];

/**
 * One card in the catalogue: a product and every flavour of it the shop sells
 * (Phase 31). A product with no siblings is a group of one and draws exactly
 * the card it drew before.
 *
 * `variants` is ordered by `groupProducts`, and `priceFrom`/`priceTo` bracket
 * it so a card can say "from RM 210.00" where the flavours are priced apart.
 * In the catalogue as it stands they never are — all 81 multi-variant groups
 * price every flavour identically — but a card that silently showed one
 * flavour's price as if it were the group's would be a lie the day that
 * changes.
 */
export type ShopProductGroup = {
  key: string;
  /** The shared title, with no variant on the end. */
  name: string;
  brand: string | null;
  packSize: number | null;
  market: string | null;
  unit: string;
  category: string;
  variants: ShopProduct[];
  priceFrom: string;
  priceTo: string;
};

/**
 * Wraps a single product as a group of one, for the two places that show a
 * card without having grouped anything: the home page's best sellers and a
 * product page's "More from {brand}" rail.
 *
 * It lives here, not beside the card that consumes it, because `ShopProductCard`
 * is a `"use client"` module and a server component cannot *call* a function
 * exported from one — it may only render its components. Both callers are
 * server components (measured: the product page threw
 * "Attempted to call singleGroup() from the server" until this moved).
 */
export function singleGroup(product: ShopProduct): ShopProductGroup {
  return {
    key: product.id,
    name: product.name,
    brand: product.brand,
    packSize: product.packSize,
    market: product.market,
    unit: product.unit,
    category: product.category,
    variants: [product],
    priceFrom: product.listPrice,
    priceTo: product.listPrice,
  };
}

export type ShopCatalogue = {
  /** Cards, not rows: `total` counts these, and so does every facet. */
  groups: ShopProductGroup[];
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

/** The family's id and name, selected wherever a product is grouped. */
const FAMILY_SELECT = { select: { id: true, name: true } } as const;

const SHOP_PRODUCT_SELECT = {
  id: true,
  sku: true,
  name: true,
  family: FAMILY_SELECT,
  brand: true,
  variant: true,
  category: true,
  market: true,
  packSize: true,
  cartonsPerPallet: true,
  unit: true,
  listPrice: true,
  images: {
    orderBy: { position: "asc" },
    take: 1,
    select: { thumbKey: true, r2Key: true },
  },
} satisfies Prisma.ProductSelect;

type ShopProductRow = Prisma.ProductGetPayload<{ select: typeof SHOP_PRODUCT_SELECT }>;

/** `Groupable`'s two family fields from a row's `family` relation. */
const familyFields = (row: { family?: { id: string; name: string } | null }) => ({
  familyId: row.family?.id ?? null,
  familyName: row.family?.name ?? null,
});

async function toShopProduct(row: ShopProductRow): Promise<ShopProduct> {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    ...familyFields(row),
    brand: row.brand,
    variant: row.variant,
    category: row.category,
    market: row.market,
    packSize: row.packSize,
    cartonsPerPallet: row.cartonsPerPallet,
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
/**
 * The products `where` **minus every facet filter** — category and the search
 * box only.
 *
 * Phase 31 changed what this is for. The catalogue now counts and pages over
 * *cards*, and a card is a group derived in TypeScript from a name the
 * database cannot group on (`groupName` strips a variant suffix the importer
 * appended). So one narrow read brings back the candidate set and the
 * grouping, the facet counts and the page are all computed from it — where
 * before there were six queries, each answering about rows.
 */
function baseWhere(query: ShopCatalogueQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { ...SHOP_VISIBLE };
  if (query.category) where.category = query.category;
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

/** Everything grouping, faceting and sorting needs. No images: the page's own
 * rows are fetched separately, so no thumbnail is ever signed for a card that
 * is not on screen. */
const GROUPING_SELECT = {
  id: true,
  sku: true,
  name: true,
  family: FAMILY_SELECT,
  brand: true,
  variant: true,
  packSize: true,
  market: true,
  category: true,
  unit: true,
  listPrice: true,
} satisfies Prisma.ProductSelect;

type GroupingRow = Prisma.ProductGetPayload<{ select: typeof GROUPING_SELECT }>;

/** A grouping row with its family flattened into what `groupProducts` reads. */
const groupable = <R extends { family?: { id: string; name: string } | null }>(row: R) => ({
  ...row,
  ...familyFields(row),
});

type FacetFilters = Pick<ShopCatalogueQuery, "brands" | "packSizes" | "markets">;

/** Applies the facet filters, optionally leaving one of them out — which is
 * what makes a facet's count answer "what would I get if I also ticked this"
 * rather than "what do I already have". */
function matchesFacets(
  row: GroupingRow,
  query: FacetFilters,
  omit?: "brands" | "packSizes" | "markets",
): boolean {
  if (omit !== "brands" && query.brands.length) {
    if (!row.brand || !query.brands.includes(row.brand)) return false;
  }
  if (omit !== "packSizes" && query.packSizes.length) {
    if (row.packSize === null || !query.packSizes.includes(row.packSize)) return false;
  }
  if (omit !== "markets" && query.markets.length) {
    if (!row.market || !query.markets.includes(row.market)) return false;
  }
  return true;
}

type GroupableRow = ReturnType<typeof groupable<GroupingRow>>;

const priceOf = (group: ProductGroup<GroupableRow>) =>
  group.variants.map((variant) => variant.listPrice);

function sortGroups(
  groups: ProductGroup<GroupableRow>[],
  sort: ShopSort,
): ProductGroup<GroupableRow>[] {
  const sorted = [...groups];
  switch (sort) {
    case "price-asc":
      // The cheapest flavour is what "from RM x" shows, so it is what the
      // card sorts on.
      return sorted.sort(
        (a, b) =>
          Math.min(...priceOf(a).map(Number)) - Math.min(...priceOf(b).map(Number)) ||
          a.name.localeCompare(b.name),
      );
    case "price-desc":
      return sorted.sort(
        (a, b) =>
          Math.max(...priceOf(b).map(Number)) - Math.max(...priceOf(a).map(Number)) ||
          a.name.localeCompare(b.name),
      );
    default:
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** Counts cards, not products, per facet value. */
function facetCounts<T extends string | number>(
  rows: GroupingRow[],
  query: FacetFilters,
  omit: "brands" | "packSizes" | "markets",
  valueOf: (row: GroupingRow) => T | null,
): Facet<T> {
  const counts = new Map<T, number>();
  for (const group of groupProducts(
    rows.filter((row) => matchesFacets(row, query, omit)).map(groupable),
  )) {
    const value = valueOf(group.variants[0]);
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => String(a.value).localeCompare(String(b.value), undefined, { numeric: true }));
}

export async function listShopProducts(
  query: ShopCatalogueQuery,
): Promise<ShopCatalogue> {
  const [rows, categories] = await Promise.all([
    prisma.product.findMany({
      where: baseWhere(query),
      select: GROUPING_SELECT,
      orderBy: { name: "asc" },
    }),
    shopCategories(),
  ]);

  const matching = rows.filter((row) => matchesFacets(row, query)).map(groupable);
  const groups = sortGroups(groupProducts(matching), query.sort);
  const total = groups.length;

  const skip = (query.page - 1) * SHOP_PER_PAGE;
  const pageGroups = groups.slice(skip, skip + SHOP_PER_PAGE);

  // Only now does the database hear about images: one read for the products
  // on this page, however many groups they came from.
  const ids = pageGroups.flatMap((group) => group.variants.map((variant) => variant.id));
  const full = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        select: SHOP_PRODUCT_SELECT,
      })
    : [];
  const byId = new Map(
    await Promise.all(
      full.map(async (row) => [row.id, await toShopProduct(row)] as const),
    ),
  );

  return {
    groups: pageGroups.map((group) => {
      const variants = group.variants
        .map((variant) => byId.get(variant.id))
        .filter((variant): variant is ShopProduct => variant !== undefined);
      const prices = variants.map((variant) => Number(variant.listPrice));
      return {
        key: group.key,
        name: group.name,
        brand: group.brand,
        packSize: group.packSize,
        market: group.market,
        unit: group.variants[0].unit,
        category: group.variants[0].category,
        variants,
        priceFrom: Math.min(...prices).toFixed(2),
        priceTo: Math.max(...prices).toFixed(2),
      };
    }),
    total,
    categories,
    facets: {
      brands: facetCounts(rows, query, "brands", (row) => row.brand),
      packSizes: facetCounts(rows, query, "packSizes", (row) => row.packSize),
      markets: facetCounts(rows, query, "markets", (row) => row.market),
    },
  };
}

/**
 * What the variant picker renders: enough to label a chip and link to it.
 *
 * `packSize` and `unit` were added in Phase 39 for `VariantBuyRows`, which
 * needs them for the same reason `BuyBox` does — a `CartonStepper` shows
 * pieces per carton, and the per-carton unit is not always "carton".
 */
export type ShopVariant = {
  id: string;
  sku: string;
  name: string;
  variant: string | null;
  listPrice: string;
  packSize: number | null;
  unit: string;
};

const VARIANT_SELECT = {
  id: true,
  sku: true,
  name: true,
  family: FAMILY_SELECT,
  brand: true,
  variant: true,
  packSize: true,
  market: true,
  unit: true,
  listPrice: true,
} satisfies Prisma.ProductSelect;

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
  /** The product's own flavours, which the page already shows in its picker. */
  siblingIds: readonly string[] = [],
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
    // Over-fetch, because the filter below can remove some: a sibling variant
    // is already on this page in the picker and must not be offered again as
    // if it were a different product (Phase 31).
    take: 12,
  });
  const siblings = new Set(siblingIds);
  const others = rows.filter((row) => !siblings.has(row.id)).slice(0, 4);
  return Promise.all(others.map(toShopProduct));
}

/**
 * The flavours of one product, including the product itself — the picker on
 * its own page (Phase 31).
 *
 * With a family (Phase 36) the database can be asked for the family, pack
 * size and market outright. Without one the key is partly derived
 * (`groupName` strips a variant suffix), so it is asked instead for the
 * candidates that share the parts it *can* match — brand, pack size, market —
 * and the group is picked out of those in memory. That set is small: the whole
 * development catalogue holds 308 shop-visible products and its largest such
 * bucket is well under a hundred.
 */
export async function variantsOfProduct(product: {
  id: string;
  sku: string;
  name: string;
  familyId: string | null;
  brand: string | null;
  variant: string | null;
  packSize: number | null;
  market: string | null;
}): Promise<ShopVariant[]> {
  const candidates = await prisma.product.findMany({
    where: {
      ...SHOP_VISIBLE,
      ...(product.familyId ? { familyId: product.familyId } : { brand: product.brand }),
      // Pack size is deliberately absent (Phase 40): it is a variant now, so
      // the 12-carton row must be offered on the 6-carton row's page.
      market: product.market,
    },
    select: VARIANT_SELECT,
    orderBy: { name: "asc" },
  });

  const group = groupProducts(candidates.map(groupable)).find((candidate) =>
    candidate.variants.some((variant) => variant.id === product.id),
  );
  if (!group) return [];
  return group.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    variant: variant.variant,
    listPrice: variant.listPrice.toFixed(2),
    packSize: variant.packSize,
    unit: variant.unit,
  }));
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
      family: FAMILY_SELECT,
      brand: true,
      variant: true,
      category: true,
      market: true,
      packSize: true,
      cartonsPerPallet: true,
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
    ...familyFields(row),
    brand: row.brand,
    variant: row.variant,
    category: row.category,
    market: row.market,
    packSize: row.packSize,
    cartonsPerPallet: row.cartonsPerPallet,
    unit: row.unit,
    listPrice: row.listPrice.toFixed(2),
    description: row.description,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
  };
}
