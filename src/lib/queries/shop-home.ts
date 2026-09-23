import { Prisma } from "@/generated/prisma/client";
import { twelveMonthWindow } from "@/lib/analytics/products";
import { prisma } from "@/lib/prisma";
import { SHOP_VISIBLE, thumbUrl, type ShopProduct } from "@/lib/queries/shop-catalogue";

export type ShopHome = {
  categories: ShopHomeCategory[];
  bestSellers: ShopProduct[];
  /**
   * True when nothing has sold in the window and `bestSellers` is really
   * `newestProducts()` — the development database, and production until the
   * catalogue sells, both live here. `BestSellers.tsx` reads it to drop the
   * "Best seller" badge and retitle the rail rather than mislabel an
   * arbitrary new product.
   */
  bestSellersAreFallback: boolean;
  brands: { name: string; categories: string[] }[];
};

export type ShopHomeCategory = {
  name: string;
  count: number;
  /**
   * One photographed product from the category, standing as its picture.
   * Null where the category has no photographed product at all — which is
   * every category until someone uploads one, so the tile draws its own mark
   * rather than leaving a hole.
   */
  imageUrl: string | null;
};

const HOME_PRODUCT_SELECT = {
  id: true,
  sku: true,
  name: true,
  family: { select: { id: true, name: true } },
  brand: true,
  variant: true,
  category: true,
  market: true,
  packSize: true,
  cartonsPerPallet: true,
  unit: true,
  listPrice: true,
  images: {
    take: 1,
    orderBy: { position: "asc" },
    select: { thumbKey: true, r2Key: true },
  },
} satisfies Prisma.ProductSelect;

type HomeProductRow = Prisma.ProductGetPayload<{ select: typeof HOME_PRODUCT_SELECT }>;

async function toShopProduct(row: HomeProductRow): Promise<ShopProduct> {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    familyId: row.family?.id ?? null,
    familyName: row.family?.name ?? null,
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

/** The fallback when nothing has sold in the window: the newest four visible products. */
async function newestProducts(): Promise<ShopProduct[]> {
  const rows = await prisma.product.findMany({
    where: SHOP_VISIBLE,
    orderBy: { createdAt: "desc" },
    take: 4,
    select: HOME_PRODUCT_SELECT,
  });
  return Promise.all(rows.map(toShopProduct));
}

/**
 * Top four by summed carton quantity over the twelve-month window, loaded in
 * that order. `findMany({ where: { id: { in } } })` makes no promise about
 * row order, so the reorder against `ids` happens here rather than being
 * assumed from the query.
 *
 * `isFallback` is true when nothing has sold and `products` is really
 * `newestProducts()` — the caller needs to know this to stop badging an
 * arbitrary new product "Best seller".
 */
async function bestSellingProducts(window: {
  from: Date;
  to: Date;
}): Promise<{ products: ShopProduct[]; isFallback: boolean }> {
  const totals = await prisma.lineItem.groupBy({
    by: ["productId"],
    where: {
      productId: { not: null },
      purchaseOrder: { poDate: { gte: window.from }, supersededBy: null },
      product: SHOP_VISIBLE,
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 4,
  });

  const ids = totals
    .map((row) => row.productId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return { products: await newestProducts(), isFallback: true };

  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: HOME_PRODUCT_SELECT,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((row): row is HomeProductRow => Boolean(row));
  return { products: await Promise.all(ordered.map(toShopProduct)), isFallback: false };
}

/**
 * One photographed product per category, to stand as that category's picture.
 *
 * `images: { some: {} }` is what makes the row worth having: a product with no
 * photo can never supply one, so asking for a representative product and then
 * finding it has none would cost a query and return nothing. Every category in
 * the returned map therefore has a real image, and a category absent from it
 * has no photographed product — the tile's own mark covers that, and covers it
 * for the whole catalogue today, where no product carries a photo.
 */
async function categoryImages(): Promise<Map<string, string>> {
  const rows = await prisma.product.findMany({
    where: { ...SHOP_VISIBLE, images: { some: {} } },
    distinct: ["category"],
    orderBy: { category: "asc" },
    select: {
      category: true,
      images: {
        take: 1,
        orderBy: { position: "asc" },
        select: { thumbKey: true, r2Key: true },
      },
    },
  });

  const signed = await Promise.all(
    rows.map(async (row) => [row.category, await thumbUrl(row.images)] as const),
  );
  // `thumbUrl` returns null when the object will not presign, so a row can
  // still arrive without a usable URL; those categories fall back like the
  // unphotographed ones rather than carrying a null through the payload.
  return new Map(
    signed.filter((entry): entry is [string, string] => entry[1] !== null),
  );
}

/** Distinct brand → its categories, folded from a brand/category-sorted read. */
async function brandCards(): Promise<{ name: string; categories: string[] }[]> {
  const rows = await prisma.product.findMany({
    where: { ...SHOP_VISIBLE, brand: { not: null } },
    distinct: ["brand", "category"],
    select: { brand: true, category: true },
    orderBy: [{ brand: "asc" }, { category: "asc" }],
  });

  const byBrand = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.brand) continue;
    const categories = byBrand.get(row.brand) ?? [];
    if (!categories.includes(row.category)) categories.push(row.category);
    byBrand.set(row.brand, categories);
  }
  return [...byBrand.entries()].map(([name, categories]) => ({ name, categories }));
}

/** Everything the home page needs, in one call — §5.2. */
export async function loadShopHome(): Promise<ShopHome> {
  const window = twelveMonthWindow();

  const [categoryRows, images, brands, bestSellers] = await Promise.all([
    prisma.product.groupBy({
      by: ["category"],
      where: SHOP_VISIBLE,
      _count: { _all: true },
      orderBy: { category: "asc" },
    }),
    categoryImages(),
    brandCards(),
    bestSellingProducts(window),
  ]);

  return {
    categories: categoryRows.map((row) => ({
      name: row.category,
      count: row._count._all,
      imageUrl: images.get(row.category) ?? null,
    })),
    bestSellers: bestSellers.products,
    bestSellersAreFallback: bestSellers.isFallback,
    brands,
  };
}
