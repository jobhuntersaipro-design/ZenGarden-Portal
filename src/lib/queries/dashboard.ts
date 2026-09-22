import { ExtractionStatus } from "@/generated/prisma/enums";
import { dateColumnRange, type Aggregation } from "@/lib/dates";
import { openWebOrderCount } from "@/lib/queries/web-orders";
import { ORDER_IDENTITY_SELECT, orderIdentity, type OrderIdentity } from "@/lib/order-identity";
import { prisma } from "@/lib/prisma";
import { buyerChurn, type BuyerChurn } from "@/lib/analytics/churn";
import { deliveryByMarket, type DeliveryPerformance } from "@/lib/analytics/delivery";
import {
  attribution,
  filterCaption,
  filterOrders,
  isFiltered,
  resolveFilter,
  type Attribution,
  type LineFilter,
} from "@/lib/analytics/line-filter";
import { marketMix, type MarketMix } from "@/lib/analytics/market-mix";
import {
  seriesOptions,
  seriesPerBucket,
  subjectKey,
  type SeriesOption,
  type TrendPoint,
  type TrendSubject,
} from "@/lib/analytics/trend";
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
import {
  kpis,
  salesSeries,
  type Kpis,
  type SalesMeasure,
  type SalesSeries,
} from "@/lib/analytics/sales";
import { shareBy, type ShareSlice } from "@/lib/analytics/share";
import type { AnalyticsOrder } from "@/lib/analytics/types";

/** Only the latest revision of a PO counts; a superseded one is history. */
const LATEST_ONLY = { supersededBy: { is: null } } as const;

const ORDER_SELECT = {
  id: true,
  buyerId: true,
  poDate: true,
  deliveryDate: true,
  total: true,
  stage: true,
  buyer: { select: { name: true } },
} as const;

/**
 * A line, with the three columns the dashboard filters and trends by. They
 * come off the *product*, because that is where a market lives — see
 * `docs/specs/53-dashboard-analytics-and-market.md` §2.
 */
const LINE_SELECT = {
  select: {
    productId: true,
    quantity: true,
    amount: true,
    product: {
      select: { name: true, market: true, brand: true, category: true },
    },
  },
} as const;

type Row = {
  id: string;
  buyerId: string;
  poDate: Date;
  deliveryDate: Date | null;
  total: { toNumber(): number };
  stage: AnalyticsOrder["stage"];
  buyer: { name: string };
  lineItems?: {
    productId: string | null;
    quantity: { toNumber(): number };
    amount: { toNumber(): number };
    product: {
      name: string;
      market: string | null;
      brand: string | null;
      category: string;
    } | null;
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
  buyerId: row.buyerId,
  buyerName: row.buyer.name,
  poDate: row.poDate,
  deliveryDate: row.deliveryDate,
  total: row.total.toNumber(),
  stage: row.stage,
  lineItems: (row.lineItems ?? []).map((line) => ({
    productId: line.productId,
    productName: line.product?.name ?? null,
    // Null on all three where the line matched no product at all — which is
    // not the same as a product carrying no market, and `line-filter.ts`
    // keeps the two apart.
    market: line.product?.market ?? null,
    brand: line.product?.brand ?? null,
    category: line.product?.category ?? null,
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
  /**
   * Submitted shop orders. Deliberately NOT scoped by the page's date range:
   * a shop order has no PO date, so a ranged link to it lands on an empty
   * table — the defect already recorded against the intake links in the
   * 2026-09-06 UI-change brief.
   */
  webOrders: number;
};

/** What the page asked for beyond the dates. */
export type DashboardQuery = {
  filter: LineFilter;
  trend: TrendSubject;
  measure: SalesMeasure;
  /** Chosen series, blanks preserved as freed colour slots; [] means default. */
  series: string[];
};

export type DashboardTrend = {
  subject: TrendSubject;
  points: TrendPoint[];
  options: SeriesOption[];
  /** The colour assignment the chart draws, holes and all. */
  slots: string[];
};

export type DashboardData = {
  /** Echoed back so the toolbar renders what the page resolved, never the raw URL. */
  query: DashboardQuery;
  filtered: boolean;
  filterCaption: string | null;
  /** Every market, brand and category with sales in range — the filter's own options. */
  options: { markets: string[]; brands: string[]; categories: string[] };
  attribution: Attribution;
  marketShare: ShareSlice[];
  marketMix: MarketMix;
  delivery: DeliveryPerformance;
  trend: DashboardTrend;
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
    largest: {
      id: string;
      /** Our Order ID and the buyer's PO number, never one for the other. */
      identity: OrderIdentity;
      buyerName: string;
      total: number;
    } | null;
    newBuyers: number;
    returningBuyers: number;
    topThreeShare: number;
    itemsPerOrder: number;
    totalUnits: number;
    failureRate: number;
    uploadCount: number;
    failedCount: number;
    /** Distinct markets with sales among the lines being counted. */
    marketCount: number;
    unitsPerOrder: number;
    /** Buyers in range with more than one order, as a percent of buyers. */
    repeatRate: number;
    repeatBuyers: number;
  };
  hasAnyOrders: boolean;
};

/** Six is the palette's limit, not a judgement — `SHARE_VARS` holds six. */
const MAX_SERIES = 6;

export async function loadDashboard(
  range: Range,
  agg: Aggregation,
  query: DashboardQuery = {
    filter: {},
    trend: "market",
    measure: "sales",
    series: [],
  },
): Promise<DashboardData> {
  const previous = previousPeriod(range);

  const [current, prior, history, intakeRows, anyOrder, openWebOrders] =
    await Promise.all([
      prisma.purchaseOrder.findMany({
        where: { ...LATEST_ONLY, poDate: dateColumnRange(range) },
        select: {
          ...ORDER_SELECT,
          // Only this range's orders: the "Largest PO" card names one of them.
          ...ORDER_IDENTITY_SELECT,
          lineItems: LINE_SELECT,
          stageEvents: { select: { toStage: true, changedAt: true } },
        },
      }),
      prisma.purchaseOrder.findMany({
        where: { ...LATEST_ONLY, poDate: dateColumnRange(previous) },
        select: {
          ...ORDER_SELECT,
          // The prior period carries lines too now: the market mix compares
          // this period's shares against last period's, and that needs the
          // same attribution on both sides.
          lineItems: LINE_SELECT,
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
      openWebOrderCount(),
    ]);

  // Everything in the range, before anything is narrowed. Two figures read
  // this rather than the filtered set on purpose: `attribution`, which is a
  // statement about how complete the catalogue is and would say nothing once
  // narrowed to one market, and the market trend's own picker, so choosing
  // Vietnam never removes Mydin from the control that would take you back.
  const allOrders = current.map((row) => toAnalytics(row as Row));
  const allPriorOrders = prior.map((row) => toAnalytics(row as Row));

  const allLines = allOrders.flatMap((order) => order.lineItems);
  const distinct = <T,>(values: (T | null)[]) =>
    [...new Set(values.filter((v): v is T => Boolean(v)))].sort();
  const options = {
    markets: distinct(allLines.map((line) => line.market)),
    brands: distinct(allLines.map((line) => line.brand)),
    categories: distinct(allLines.map((line) => line.category)),
  };

  // A filter naming something nothing in range carries is dropped, not
  // honoured — see `resolveFilter`. From here down `filter` is what the page
  // is really applying, and it is what the toolbar renders.
  const filter = resolveFilter(query.filter, {
    ...options,
    hasNoMarket: allLines.some(
      (line) => line.productId !== null && line.market === null,
    ),
  });

  // From here down, "orders" means the lines that match the filter — the
  // §2.1 rule. With no filter these are the same arrays, untouched, so the
  // unfiltered dashboard still reports order totals exactly as it always has.
  const orders = filterOrders(allOrders, filter);
  const priorOrders = filterOrders(allPriorOrders, filter);
  const historyOrders = history.map((row) => toAnalytics(row as Row));

  const countFor = (status: ExtractionStatus) =>
    intakeRows.find((row) => row.status === status)?._count ?? 0;

  // Confirmed is the PO count for the range, so this bar and the KPI above it
  // report the same number. The other three are uploads in the range that have
  // not become orders — a different date field, necessarily, because a draft
  // has no PO date yet.
  const intake: IntakeCounts = {
    confirmed: allOrders.length,
    needsReview: countFor(ExtractionStatus.SUCCEEDED),
    extracting:
      countFor(ExtractionStatus.RUNNING) + countFor(ExtractionStatus.PENDING),
    failed: countFor(ExtractionStatus.FAILED),
    webOrders: openWebOrders,
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
    if (seen === undefined || time < seen)
      firstOrderAt.set(order.buyerId, time);
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

  const ordersPerBuyer = new Map<string, number>();
  for (const order of orders) {
    ordersPerBuyer.set(order.buyerId, (ordersPerBuyer.get(order.buyerId) ?? 0) + 1);
  }
  const repeatBuyers = [...ordersPerBuyer.values()].filter((n) => n > 1).length;

  const marketShare = shareBy(
    orders.flatMap((order) => order.lineItems),
    (line) => (line.market ? { id: line.market, label: line.market } : null),
    (line) => line.amount,
  );

  /* ---- The trend card ------------------------------------------------- */

  // Money or cartons, the same switch the sales card above it reads, so the
  // page never draws two measures at once without saying which.
  const trendValue =
    query.measure === "sales"
      ? (line: { amount: number }) => line.amount
      : (line: { quantity: number }) => line.quantity;

  // Markets rank off the unfiltered pass; buyers and products off the
  // filtered one, where offering a series the chart would draw flat is the
  // worse failure.
  const trendOptions = seriesOptions(
    query.trend === "market" ? allOrders : orders,
    query.trend,
    trendValue,
  );

  // The URL wins where it names series that still exist; otherwise the top
  // six. A stale id is dropped rather than drawn as an empty line, and its
  // slot is left blank so the survivors keep their colours.
  const known = new Set(trendOptions.map((option) => option.id));
  const asked = query.series.map((id) => (known.has(id) ? id : ""));
  const slots = asked.some(Boolean)
    ? asked.slice(0, MAX_SERIES)
    : trendOptions.slice(0, MAX_SERIES).map((option) => option.id);
  const selected = slots.filter(Boolean);

  return {
    query: { ...query, filter },
    filtered: isFiltered(filter),
    filterCaption: filterCaption(filter),
    options,
    // Unfiltered on purpose — see the comment where `allOrders` is built.
    attribution: attribution(allOrders),
    marketShare,
    marketMix: marketMix(orders, priorOrders),
    // The one figure that does not narrow to lines: on time is a property of
    // the order, and §4.4 explains why counting one order in two markets is
    // right for a rate and wrong for a sum.
    delivery: deliveryByMarket(orders),
    trend: {
      subject: query.trend,
      points: seriesPerBucket(
        orders,
        selected,
        subjectKey(query.trend),
        trendValue,
        range.from,
        range.to,
        agg,
      ),
      options: trendOptions,
      slots,
    },
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
            identity: orderIdentity(current.find((row) => row.id === largest.id)!),
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
      marketCount: new Set(
        orders
          .flatMap((order) => order.lineItems)
          .map((line) => line.market)
          .filter(Boolean),
      ).size,
      unitsPerOrder: orders.length > 0 ? totalUnits / orders.length : 0,
      repeatRate:
        buyersInRange.size > 0 ? (repeatBuyers / buyersInRange.size) * 100 : 0,
      repeatBuyers,
    },
    hasAnyOrders: anyOrder !== null,
  };
}
