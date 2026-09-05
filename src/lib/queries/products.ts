import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  needsAttention,
  productStats,
  twelveMonthWindow,
  type AttentionFlag,
  type ProductSaleRow,
  type ProductStats,
} from "@/lib/analytics/products";

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  listPrice: number;
  active: boolean;
  imageCount: number;
  thumbKey: string | null;
  stats: ProductStats;
  flags: AttentionFlag[];
};

export const PRODUCT_SORT_KEYS = [
  "name",
  "category",
  "listPrice",
  "drift",
  "units",
  "revenue",
  "buyers",
  "status",
] as const;

export type ProductSortKey = (typeof PRODUCT_SORT_KEYS)[number];

export type ProductFilter =
  | "missing-image"
  | "inactive"
  | "price-moved"
  | "not-sold-60d"
  | null;

const LATEST_ONLY = { supersededBy: { is: null } } as const;

/**
 * Every figure on the catalog comes from this one call: the KPI row, the rows,
 * the footer summary. Two numbers describing the same thing must not be able
 * to disagree, so there is one fetch and one window.
 */
export async function listProducts(
  now: Date = new Date(),
): Promise<{
  products: ProductRow[];
  window: { from: Date; to: Date };
  totalOrders: number;
}> {
  const window = twelveMonthWindow(now);

  const [products, lineItems, totalOrders] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        unit: true,
        listPrice: true,
        active: true,
        images: {
          orderBy: { position: "asc" },
          select: { thumbKey: true, r2Key: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.lineItem.findMany({
      where: {
        productId: { not: null },
        purchaseOrder: {
          ...LATEST_ONLY,
          poDate: { gte: window.from, lte: window.to },
        },
      },
      select: {
        productId: true,
        quantity: true,
        amount: true,
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            poDate: true,
            buyerId: true,
            buyer: { select: { name: true } },
          },
        },
      },
    }),
    prisma.purchaseOrder.count({
      where: { ...LATEST_ONLY, poDate: { gte: window.from, lte: window.to } },
    }),
  ]);

  const rowsByProduct = new Map<string, ProductSaleRow[]>();
  for (const line of lineItems) {
    if (!line.productId) continue;
    const list = rowsByProduct.get(line.productId) ?? [];
    list.push({
      purchaseOrderId: line.purchaseOrder.id,
      poNumber: line.purchaseOrder.poNumber,
      poDate: line.purchaseOrder.poDate,
      buyerId: line.purchaseOrder.buyerId,
      buyerName: line.purchaseOrder.buyer.name,
      productId: line.productId,
      quantity: line.quantity.toNumber(),
      amount: line.amount.toNumber(),
    });
    rowsByProduct.set(line.productId, list);
  }

  const withStats = products.map((product) => {
    const rows = rowsByProduct.get(product.id) ?? [];
    return {
      product,
      rows,
      stats: productStats(
        rows,
        product.listPrice.toNumber(),
        totalOrders,
        window,
        now,
      ),
    };
  });

  const flagsById = new Map(
    needsAttention(
      withStats.map(({ product }) => ({
        id: product.id,
        active: product.active,
        imageCount: product.images.length,
      })),
      new Map(
        withStats.map(({ product, stats }) => [
          product.id,
          { lastSold: stats.lastSold, driftPercent: stats.driftPercent },
        ]),
      ),
      now,
    ).map((entry) => [entry.productId, entry.flags]),
  );

  return {
    window,
    totalOrders,
    products: withStats.map(({ product, stats }) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      unit: product.unit,
      listPrice: product.listPrice.toNumber(),
      active: product.active,
      imageCount: product.images.length,
      thumbKey: product.images[0]?.thumbKey ?? product.images[0]?.r2Key ?? null,
      stats,
      flags: flagsById.get(product.id) ?? [],
    })),
  };
}

/** Filtering, searching and sorting happen after the stats exist. */
export function selectProducts(
  products: ProductRow[],
  {
    q,
    category,
    filter,
    sort,
  }: {
    q?: string;
    category?: string;
    filter: ProductFilter;
    sort: { key: ProductSortKey; dir: "asc" | "desc" };
  },
): ProductRow[] {
  const needle = q?.trim().toLowerCase();

  const filtered = products.filter((product) => {
    if (
      needle &&
      !product.name.toLowerCase().includes(needle) &&
      !product.sku.toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (category && product.category !== category) return false;
    if (filter && !product.flags.includes(filter)) return false;
    return true;
  });

  const value = (product: ProductRow): number | string => {
    switch (sort.key) {
      case "name":
        return product.name.toLowerCase();
      case "category":
        return product.category.toLowerCase();
      case "listPrice":
        return product.listPrice;
      case "drift":
        return product.stats.driftPercent ?? 0;
      case "units":
        return product.stats.units;
      case "revenue":
        return product.stats.revenue;
      case "buyers":
        return product.stats.buyers;
      case "status":
        // Most in need of attention first.
        return product.flags.length;
    }
  };

  return [...filtered].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const comparison =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
    return sort.dir === "asc" ? comparison : -comparison;
  });
}

/** Cents. Float addition is not associative, so summing the same products in
 * a different order gives a different last bit — and the KPI row sums them
 * unsorted while the footer sums them sorted. At 2dp they printed the same,
 * but the rule is that the two are *identical*, and an equality that depends
 * on iteration order is not one.
 */
const toCents = (value: number) => Math.round(value * 100) / 100;

/** Totals over whatever set is passed — all products, or the filtered ones. */
export function summarise(products: ProductRow[]) {
  return {
    count: products.length,
    revenue: toCents(
      products.reduce((sum, product) => sum + product.stats.revenue, 0),
    ),
    units: products.reduce((sum, product) => sum + product.stats.units, 0),
    activeCount: products.filter((product) => product.active).length,
    categories: new Set(products.map((product) => product.category)).size,
    best: [...products].sort((a, b) => b.stats.revenue - a.stats.revenue)[0] ?? null,
    attention: {
      missingImage: products.filter((p) => p.flags.includes("missing-image")).length,
      inactive: products.filter((p) => p.flags.includes("inactive")).length,
      notSold: products.filter((p) => p.flags.includes("not-sold-60d")).length,
      priceMoved: products.filter((p) => p.flags.includes("price-moved")).length,
    },
  };
}

export type ProductSummary = ReturnType<typeof summarise>;
export type { Prisma };
