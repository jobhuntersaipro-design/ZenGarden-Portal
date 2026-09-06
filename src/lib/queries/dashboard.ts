import { ExtractionStatus } from "@/generated/prisma/enums";
import { dateColumnRange, type Aggregation } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { buyerChurn, type BuyerChurn } from "@/lib/analytics/churn";
import {
  openPipeline,
  stageBreakdown,
  stageSeries,
  type OpenPipeline,
  type StageBreakdown,
  type StagePoint,
} from "@/lib/analytics/fulfillment";
import { priceDrift, type PriceDrift } from "@/lib/analytics/price-drift";
import { previousPeriod, type Range } from "@/lib/analytics/range";
import { kpis, salesSeries, type Kpis, type SalesSeries } from "@/lib/analytics/sales";
import { shareBy, type ShareSlice } from "@/lib/analytics/share";
import type { AnalyticsOrder } from "@/lib/analytics/types";

/** Only the latest revision of a PO counts; a superseded one is history. */
const LATEST_ONLY = { supersededBy: { is: null } } as const;

const ORDER_SELECT = {
  id: true,
  poNumber: true,
  buyerId: true,
  poDate: true,
  total: true,
  stage: true,
  buyer: { select: { name: true } },
} as const;

type Row = {
  id: string;
  poNumber: string;
  buyerId: string;
  poDate: Date;
  total: { toNumber(): number };
  stage: AnalyticsOrder["stage"];
  buyer: { name: string };
  lineItems?: {
    productId: string | null;
    quantity: { toNumber(): number };
    amount: { toNumber(): number };
    product: { name: string } | null;
  }[];
  stageEvents?: { toStage: AnalyticsOrder["stage"]; changedAt: Date }[];
};

/**
 * Decimal becomes number exactly here, once, on the way into the analytics
 * library — which works in plain numbers because nothing in it writes back to
 * the database (00-master.md §4).
 */
const toAnalytics = (row: Row): AnalyticsOrder => ({
  id: row.id,
  poNumber: row.poNumber,
  buyerId: row.buyerId,
  buyerName: row.buyer.name,
  poDate: row.poDate,
  total: row.total.toNumber(),
  stage: row.stage,
  lineItems: (row.lineItems ?? []).map((line) => ({
    productId: line.productId,
    productName: line.product?.name ?? null,
    quantity: line.quantity.toNumber(),
    amount: line.amount.toNumber(),
  })),
  stageEvents: row.stageEvents ?? [],
});

export type IntakeCounts = {
  confirmed: number;
  needsReview: number;
  extracting: number;
  failed: number;
};

export type DashboardData = {
  kpis: Kpis;
  sales: SalesSeries;
  stages: StagePoint[];
  stageBreakdown: StageBreakdown;
  pipeline: OpenPipeline;
  intake: IntakeCounts;
  buyerShare: ShareSlice[];
  productShare: ShareSlice[];
  churn: BuyerChurn;
  drift: PriceDrift;
  inRange: {
    largest: { id: string; poNumber: string; buyerName: string; total: number } | null;
    newBuyers: number;
    returningBuyers: number;
    topThreeShare: number;
    itemsPerOrder: number;
    totalUnits: number;
    failureRate: number;
    uploadCount: number;
    failedCount: number;
  };
  hasAnyOrders: boolean;
};

export async function loadDashboard(range: Range, agg: Aggregation): Promise<DashboardData> {
  const previous = previousPeriod(range);

  const [current, prior, history, intakeRows, anyOrder] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { ...LATEST_ONLY, poDate: dateColumnRange(range) },
      select: {
        ...ORDER_SELECT,
        lineItems: {
          select: {
            productId: true,
            quantity: true,
            amount: true,
            product: { select: { name: true } },
          },
        },
        stageEvents: { select: { toStage: true, changedAt: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { ...LATEST_ONLY, poDate: dateColumnRange(previous) },
      select: {
        ...ORDER_SELECT,
        lineItems: {
          select: {
            productId: true,
            quantity: true,
            amount: true,
            product: { select: { name: true } },
          },
        },
      },
    }),
    // Churn needs every order a buyer has ever placed to know their cadence,
    // but not their line items.
    prisma.purchaseOrder.findMany({
      where: LATEST_ONLY,
      select: ORDER_SELECT,
      orderBy: { poDate: "asc" },
    }),
    prisma.extraction.groupBy({
      by: ["status"],
      where: { document: { uploadedAt: { gte: range.from, lte: range.to } } },
      _count: true,
    }),
    prisma.purchaseOrder.findFirst({ select: { id: true } }),
  ]);

  const orders = current.map((row) => toAnalytics(row as Row));
  const priorOrders = prior.map((row) => toAnalytics(row as Row));
  const historyOrders = history.map((row) => toAnalytics(row as Row));

  const countFor = (status: ExtractionStatus) =>
    intakeRows.find((row) => row.status === status)?._count ?? 0;

  // Confirmed is the PO count for the range, so this bar and the KPI above it
  // report the same number. The other three are uploads in the range that have
  // not become orders — a different date field, necessarily, because a draft
  // has no PO date yet.
  const intake: IntakeCounts = {
    confirmed: orders.length,
    needsReview: countFor(ExtractionStatus.SUCCEEDED),
    extracting:
      countFor(ExtractionStatus.RUNNING) + countFor(ExtractionStatus.PENDING),
    failed: countFor(ExtractionStatus.FAILED),
  };

  const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
  const buyerShare = shareBy(
    orders,
    (order) => ({ id: order.buyerId, label: order.buyerName }),
    (order) => order.total,
  );
  const productShare = shareBy(
    orders.flatMap((order) => order.lineItems),
    (line) =>
      line.productId
        ? { id: line.productId, label: line.productName ?? line.productId }
        : null,
    (line) => line.amount,
  );

  const largest = orders.reduce<AnalyticsOrder | null>(
    (best, order) => (best === null || order.total > best.total ? order : best),
    null,
  );

  // New = their first-ever order falls inside the range.
  const firstOrderAt = new Map<string, number>();
  for (const order of historyOrders) {
    const time = order.poDate.getTime();
    const seen = firstOrderAt.get(order.buyerId);
    if (seen === undefined || time < seen) firstOrderAt.set(order.buyerId, time);
  }
  const buyersInRange = new Set(orders.map((order) => order.buyerId));
  let newBuyers = 0;
  for (const buyerId of buyersInRange) {
    const first = firstOrderAt.get(buyerId);
    if (first !== undefined && first >= range.from.getTime()) newBuyers += 1;
  }

  const topThree = buyerShare
    .filter((slice) => !slice.isOther)
    .slice(0, 3)
    .reduce((sum, slice) => sum + slice.value, 0);

  const totalUnits = orders.reduce(
    (sum, order) =>
      sum + order.lineItems.reduce((lines, line) => lines + line.quantity, 0),
    0,
  );
  const totalLines = orders.reduce(
    (sum, order) => sum + order.lineItems.length,
    0,
  );

  const uploadCount = intakeRows.reduce((sum, row) => sum + row._count, 0);

  return {
    kpis: kpis(orders, priorOrders),
    sales: salesSeries(orders, range.from, range.to, agg),
    stages: stageSeries(orders, range.from, range.to, agg),
    stageBreakdown: stageBreakdown(orders),
    pipeline: openPipeline(orders),
    intake,
    buyerShare,
    productShare,
    churn: buyerChurn(orders, priorOrders, historyOrders),
    drift: priceDrift(orders, priorOrders),
    inRange: {
      largest: largest
        ? {
            id: largest.id,
            poNumber: largest.poNumber,
            buyerName: largest.buyerName,
            total: largest.total,
          }
        : null,
      newBuyers,
      returningBuyers: buyersInRange.size - newBuyers,
      topThreeShare: totalSales > 0 ? (topThree / totalSales) * 100 : 0,
      itemsPerOrder: orders.length > 0 ? totalLines / orders.length : 0,
      totalUnits,
      failureRate: uploadCount > 0 ? (intake.failed / uploadCount) * 100 : 0,
      uploadCount,
      failedCount: intake.failed,
    },
    hasAnyOrders: anyOrder !== null,
  };
}
