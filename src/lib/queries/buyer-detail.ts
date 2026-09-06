import { ExtractionStatus } from "@/generated/prisma/enums";
import { dateColumnRange, type Aggregation } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { buyerStatus } from "@/lib/analytics/buyer-status";
import { productMix, type MixMeasure } from "@/lib/analytics/product-mix";
import { unitsPerBucket } from "@/lib/analytics/product-trend";
import { reorderSignals, type ReorderSignals } from "@/lib/analytics/reorder";
import { salesSeries, type SalesSeries } from "@/lib/analytics/sales";
import type { ShareSlice } from "@/lib/analytics/share";
import type { AnalyticsOrder } from "@/lib/analytics/types";
import type { IntakeCounts } from "@/lib/queries/dashboard";

const LATEST_ONLY = { supersededBy: { is: null } } as const;

export type BuyerDetail = {
  buyer: {
    id: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    paymentTerms: string | null;
    since: string | null;
  };
  rank: number;
  kpis: {
    purchases: number;
    orderCount: number;
    shareOfSales: number;
    averageOrder: number;
    itemsPerOrder: number;
    cadenceDays: number | null;
    daysSinceLastOrder: number | null;
    /** True when the gap has run past 1.5× their usual rhythm. */
    quieterThanUsual: boolean;
  };
  sales: SalesSeries;
  mix: ShareSlice[];
  productsInRange: { id: string; name: string; spend: number }[];
  trend: ReturnType<typeof unitsPerBucket>;
  reorder: ReorderSignals;
  intake: IntakeCounts;
};

/**
 * Everything the detail page needs in one pass. Unlike the roster, this loads
 * the full line-item shape — it is one buyer, and every card below the trend
 * needs product names, quantities and amounts.
 */
export async function loadBuyer(
  buyerId: string,
  range: { from: Date; to: Date },
  previous: { from: Date; to: Date },
  agg: Aggregation,
  measure: MixMeasure,
  selectedProductIds: string[],
  now: Date = new Date(),
): Promise<BuyerDetail | null> {
  const buyer = await prisma.buyer.findUnique({
    where: { id: buyerId },
    select: {
      id: true,
      name: true,
      contactName: true,
      email: true,
      phone: true,
      address: true,
      paymentTerms: true,
    },
  });
  if (!buyer) return null;

  const [history, allInRange, intakeRows] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { ...LATEST_ONLY, buyerId },
      select: {
        id: true,
        poNumber: true,
        buyerId: true,
        poDate: true,
        total: true,
        stage: true,
        lineItems: {
          select: {
            productId: true,
            quantity: true,
            amount: true,
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { poDate: "asc" },
    }),
    // Every buyer's total in range, for the share-of-sales tile.
    prisma.purchaseOrder.aggregate({
      where: { ...LATEST_ONLY, poDate: dateColumnRange(range) },
      _sum: { total: true },
    }),
    prisma.extraction.groupBy({
      by: ["status"],
      where: {
        document: {
          uploadedAt: { gte: range.from, lte: range.to },
          purchaseOrder: { buyerId },
        },
      },
      _count: true,
    }),
  ]);

  const orders: AnalyticsOrder[] = history.map((row) => ({
    id: row.id,
    poNumber: row.poNumber,
    buyerId: row.buyerId,
    buyerName: buyer.name,
    poDate: row.poDate,
    total: row.total.toNumber(),
    stage: row.stage,
    lineItems: row.lineItems.map((line) => ({
      productId: line.productId,
      productName: line.product?.name ?? null,
      quantity: line.quantity.toNumber(),
      amount: line.amount.toNumber(),
    })),
    stageEvents: [],
  }));

  const inWindow = (order: AnalyticsOrder, w: { from: Date; to: Date }) =>
    order.poDate >= w.from && order.poDate <= w.to;
  const current = orders.filter((order) => inWindow(order, range));
  const prior = orders.filter((order) => inWindow(order, previous));

  const status = buyerStatus({
    current,
    previous: prior,
    history: orders,
    range,
    recordStart: orders[0]?.poDate ?? null,
    now,
  });

  const purchases = current.reduce((sum, order) => sum + order.total, 0);
  const everyoneTotal = allInRange._sum.total?.toNumber() ?? 0;
  const lines = current.reduce((sum, order) => sum + order.lineItems.length, 0);

  // Spend per product in range, which orders the picker and picks the default.
  const spendByProduct = new Map<string, { name: string; spend: number }>();
  for (const order of current) {
    for (const line of order.lineItems) {
      if (!line.productId) continue;
      const entry = spendByProduct.get(line.productId) ?? {
        name: line.productName ?? line.productId,
        spend: 0,
      };
      entry.spend += line.amount;
      spendByProduct.set(line.productId, entry);
    }
  }
  const productsInRange = [...spendByProduct.entries()]
    .map(([id, entry]) => ({ id, name: entry.name, spend: entry.spend }))
    .sort((a, b) => b.spend - a.spend);

  const selected =
    selectedProductIds.length > 0
      ? selectedProductIds.filter((id) => spendByProduct.has(id))
      : productsInRange.slice(0, 3).map((product) => product.id);

  const countFor = (status_: ExtractionStatus) =>
    intakeRows.find((row) => row.status === status_)?._count ?? 0;

  const daysSinceLastOrder = status.daysSilent;
  const quieterThanUsual =
    status.cadenceDays !== null &&
    daysSinceLastOrder !== null &&
    daysSinceLastOrder > status.cadenceDays * 1.5;

  return {
    buyer: {
      ...buyer,
      since: orders[0]?.poDate.toISOString() ?? null,
    },
    rank: 0,
    kpis: {
      purchases,
      orderCount: current.length,
      shareOfSales: everyoneTotal > 0 ? (purchases / everyoneTotal) * 100 : 0,
      averageOrder: current.length > 0 ? purchases / current.length : 0,
      itemsPerOrder: current.length > 0 ? lines / current.length : 0,
      cadenceDays: status.cadenceDays,
      daysSinceLastOrder,
      quieterThanUsual,
    },
    sales: salesSeries(current, range.from, range.to, agg),
    mix: productMix(current, measure),
    productsInRange,
    trend: unitsPerBucket(current, selected, range.from, range.to, agg),
    // Full history on purpose: this predicts a rhythm, and the card says so.
    reorder: reorderSignals(orders, now),
    intake: {
      confirmed: current.length,
      needsReview: countFor(ExtractionStatus.SUCCEEDED),
      extracting:
        countFor(ExtractionStatus.RUNNING) + countFor(ExtractionStatus.PENDING),
      failed: countFor(ExtractionStatus.FAILED),
    },
  };
}
