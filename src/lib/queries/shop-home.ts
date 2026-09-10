import { Prisma } from "@/generated/prisma/client";
import { twelveMonthWindow } from "@/lib/analytics/products";
import { prisma } from "@/lib/prisma";
import { SHOP_VISIBLE, thumbUrl, type ShopProduct } from "@/lib/queries/shop-catalogue";

export type ShopHome = {
  categories: { name: string; count: number }[];
  bestSellers: ShopProduct[];
  brands: { name: string; categories: string[] }[];
};

const HOME_PRODUCT_SELECT = {
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
 */
async function bestSellingProducts(window: {
  from: Date;
  to: Date;
}): Promise<ShopProduct[]> {
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
  if (ids.length === 0) return newestProducts();

  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: HOME_PRODUCT_SELECT,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((row): row is HomeProductRow => Boolean(row));
  return Promise.all(ordered.map(toShopProduct));
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

  const [categoryRows, brands, bestSellers] = await Promise.all([
    prisma.product.groupBy({
      by: ["category"],
      where: SHOP_VISIBLE,
      _count: { _all: true },
      orderBy: { category: "asc" },
    }),
    brandCards(),
    bestSellingProducts(window),
  ]);

  return {
    categories: categoryRows.map((row) => ({ name: row.category, count: row._count._all })),
    bestSellers,
    brands,
  };
}
