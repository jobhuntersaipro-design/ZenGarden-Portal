import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/r2";

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
  packSize: number | null;
  unit: string;
  listPrice: string;
  imageUrl: string | null;
};

export type ShopCatalogue = {
  products: ShopProduct[];
  total: number;
  categories: string[];
  brands: string[];
};

export type ShopFilters = {
  q?: string;
  category?: string;
  brand?: string;
  skip?: number;
  take?: number;
};

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

function whereFor(filters: ShopFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { ...SHOP_VISIBLE };
  if (filters.category) where.category = filters.category;
  if (filters.brand) where.brand = filters.brand;
  const q = filters.q?.trim();
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

export async function listShopProducts(
  filters: ShopFilters = {},
): Promise<ShopCatalogue> {
  const where = whereFor(filters);
  const [rows, total, categories, brands] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        brand: true,
        variant: true,
        category: true,
        packSize: true,
        unit: true,
        listPrice: true,
        images: {
          orderBy: { position: "asc" },
          take: 1,
          select: { thumbKey: true, r2Key: true },
        },
      },
      orderBy: [{ name: "asc" }, { sku: "asc" }],
      skip: filters.skip ?? 0,
      take: filters.take ?? 30,
    }),
    prisma.product.count({ where }),
    shopCategories(),
    prisma.product.findMany({
      where: { ...SHOP_VISIBLE, brand: { not: null } },
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
  ]);

  const products = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      brand: row.brand,
      variant: row.variant,
      category: row.category,
      packSize: row.packSize,
      unit: row.unit,
      listPrice: row.listPrice.toFixed(2),
      imageUrl: await thumbUrl(row.images),
    })),
  );

  return {
    products,
    total,
    categories,
    brands: brands.map((b) => b.brand).filter((b): b is string => Boolean(b)),
  };
}

export type ShopProductDetail = ShopProduct & {
  description: string | null;
  market: string | null;
  imageUrls: string[];
};

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
