import { prisma } from "@/lib/prisma";
import {
  boughtTogether,
  priceTrend,
  productStats,
  twelveMonthWindow,
  whoBuysIt,
  type CoProduct,
  type PricePoint,
  type ProductSaleRow,
  type ProductStats,
} from "@/lib/analytics/products";
import type { ShareSlice } from "@/lib/analytics/share";

const LATEST_ONLY = { supersededBy: { is: null } } as const;

export type OrderHistoryRow = {
  lineItemId: string;
  purchaseOrderId: string;
  poNumber: string;
  buyerId: string;
  buyerName: string;
  poDate: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  poTotal: number;
  stage: string;
  /** The list price in force on the day, for the billed-vs-list highlight. */
  listPriceThen: number;
};

export type ProductDetail = {
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    unit: string;
    listPrice: number;
    description: string | null;
    active: boolean;
    updatedAt: string;
  };
  images: { id: string; url: string | null; position: number }[];
  stats: ProductStats;
  revenueShare: number;
  trend: PricePoint[];
  buyers: ShareSlice[];
  together: CoProduct[];
  history: OrderHistoryRow[];
  window: { from: Date; to: Date };
};

/**
 * The stat tiles and the order-history table are the same rows and the same
 * window — one fetch, not one each. When they were two, the table had drifted
 * to 367 days against the tiles' 365 and the counts disagreed.
 */
export async function loadProduct(
  productId: string,
  presign: (key: string) => Promise<string>,
  now: Date = new Date(),
): Promise<ProductDetail | null> {
  const window = twelveMonthWindow(now);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      unit: true,
      listPrice: true,
      description: true,
      active: true,
      updatedAt: true,
      images: {
        orderBy: { position: "asc" },
        select: { id: true, r2Key: true, thumbKey: true, position: true },
      },
      prices: { orderBy: { from: "asc" }, select: { price: true, from: true } },
    },
  });
  if (!product) return null;

  const [lines, allLines, totalOrders, everyoneRevenue, names] = await Promise.all([
    prisma.lineItem.findMany({
      where: {
        productId,
        purchaseOrder: {
          ...LATEST_ONLY,
          poDate: { gte: window.from, lte: window.to },
        },
      },
      select: {
        id: true,
        quantity: true,
        unitPrice: true,
        amount: true,
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            poDate: true,
            total: true,
            stage: true,
            buyerId: true,
            buyer: { select: { name: true } },
          },
        },
      },
      orderBy: { purchaseOrder: { poDate: "desc" } },
    }),
    // Every line on the same orders, for the bought-together card.
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
    prisma.purchaseOrder.aggregate({
      where: { ...LATEST_ONLY, poDate: { gte: window.from, lte: window.to } },
      _sum: { total: true },
    }),
    prisma.product.findMany({ select: { id: true, name: true } }),
  ]);

  const rows: ProductSaleRow[] = lines.map((line) => ({
    purchaseOrderId: line.purchaseOrder.id,
    poNumber: line.purchaseOrder.poNumber,
    poDate: line.purchaseOrder.poDate,
    buyerId: line.purchaseOrder.buyerId,
    buyerName: line.purchaseOrder.buyer.name,
    productId,
    quantity: line.quantity.toNumber(),
    amount: line.amount.toNumber(),
  }));

  const allRows: ProductSaleRow[] = allLines
    .filter((line) => line.productId !== null)
    .map((line) => ({
      purchaseOrderId: line.purchaseOrder.id,
      poNumber: line.purchaseOrder.poNumber,
      poDate: line.purchaseOrder.poDate,
      buyerId: line.purchaseOrder.buyerId,
      buyerName: line.purchaseOrder.buyer.name,
      productId: line.productId!,
      quantity: line.quantity.toNumber(),
      amount: line.amount.toNumber(),
    }));

  const listPrice = product.listPrice.toNumber();

  /** The price in force on a given day, from the appended history. */
  const priceOn = (date: Date) => {
    let price = product.prices[0]?.price.toNumber() ?? listPrice;
    for (const entry of product.prices) {
      if (entry.from <= date) price = entry.price.toNumber();
      else break;
    }
    return price;
  };

  const images = await Promise.all(
    product.images.map(async (image) => {
      const key = image.thumbKey ?? image.r2Key;
      try {
        return { id: image.id, url: await presign(key), position: image.position };
      } catch {
        // R2 unreachable: the gallery shows its empty state rather than a
        // broken tile.
        return { id: image.id, url: null, position: image.position };
      }
    }),
  );

  const everyone = everyoneRevenue._sum.total?.toNumber() ?? 0;
  const stats = productStats(rows, listPrice, totalOrders, window, now);

  return {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      unit: product.unit,
      listPrice,
      description: product.description,
      active: product.active,
      updatedAt: product.updatedAt.toISOString(),
    },
    images,
    stats,
    revenueShare: everyone > 0 ? (stats.revenue / everyone) * 100 : 0,
    trend: priceTrend(rows, window),
    buyers: whoBuysIt(rows),
    together: boughtTogether(
      rows,
      allRows,
      new Map(names.map((entry) => [entry.id, entry.name])),
    ),
    history: lines.map((line) => ({
      lineItemId: line.id,
      purchaseOrderId: line.purchaseOrder.id,
      poNumber: line.purchaseOrder.poNumber,
      buyerId: line.purchaseOrder.buyerId,
      buyerName: line.purchaseOrder.buyer.name,
      poDate: line.purchaseOrder.poDate.toISOString(),
      quantity: line.quantity.toNumber(),
      unitPrice: line.unitPrice.toNumber(),
      amount: line.amount.toNumber(),
      poTotal: line.purchaseOrder.total.toNumber(),
      stage: line.purchaseOrder.stage,
      listPriceThen: priceOn(line.purchaseOrder.poDate),
    })),
    window,
  };
}
