import type { Aggregation } from "@/lib/dates";
import { dateColumnRange } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { makeBuckets } from "@/lib/analytics/buckets";
import {
  stageBreakdown,
  stageSeries,
  type StageBreakdown,
  type StagePoint,
} from "@/lib/analytics/fulfillment";
import {
  stageByProduct,
  stageProductsByBucket,
  type StageProductRow,
} from "@/lib/analytics/stage-products";
import type { AnalyticsOrder } from "@/lib/analytics/types";

/** Only the latest revision of a PO counts; a superseded one is history. */
const LATEST_ONLY = { supersededBy: { is: null } } as const;

/**
 * Narrow on purpose: this card answers "how many orders, at which stage,
 * carrying what" and needs nothing else. Money is not read at all — the y
 * axis is an order count and the table below it is a count too.
 */
const SELECT = {
  id: true,
  buyerId: true,
  poDate: true,
  stage: true,
  buyer: { select: { name: true } },
  lineItems: {
    select: {
      productId: true,
      product: { select: { name: true } },
    },
  },
} as const;

export type PoStageBoard = {
  /** One bar per bucket, in the order the chart draws them. */
  points: StagePoint[];
  /** All six stages with their counts over the whole window. */
  breakdown: StageBreakdown;
  /** Every order in the window, per product — what the table shows at rest. */
  all: StageProductRow[];
  /** The same, one entry per bucket key, so a hover needs no round trip. */
  byBucket: Record<string, StageProductRow[]>;
  orderCount: number;
};

/**
 * The stage board for the purchase-order page.
 *
 * It reads its own window rather than the page's filters, and that is
 * deliberate: the table below the chart is a breakdown *of the bars*, so
 * narrowing it by the list's search or status chips would leave a chart and a
 * table disagreeing about which orders they are counting.
 *
 * `byBucket` is built in the same pass as the points, from the same rows, so
 * a bar's segments and the table its hover opens can never differ — the
 * failure the dashboard's market cards were built to avoid.
 */
export async function loadPoStageBoard(
  from: Date,
  to: Date,
  agg: Aggregation,
): Promise<PoStageBoard> {
  const rows = await prisma.purchaseOrder.findMany({
    where: { ...LATEST_ONLY, poDate: dateColumnRange({ from, to }) },
    select: SELECT,
  });

  const orders: AnalyticsOrder[] = rows.map((row) => ({
    id: row.id,
    buyerId: row.buyerId,
    buyerName: row.buyer.name,
    poDate: row.poDate,
    deliveryDate: null,
    total: 0,
    stage: row.stage,
    lineItems: row.lineItems.map((line) => ({
      productId: line.productId,
      productName: line.product?.name ?? null,
      market: null,
      brand: null,
      category: null,
      quantity: 0,
      amount: 0,
    })),
    stageEvents: [],
  }));

  const keys = makeBuckets(from, to, agg).map((bucket) => bucket.key);

  return {
    points: stageSeries(orders, from, to, agg),
    breakdown: stageBreakdown(orders),
    all: stageByProduct(orders, agg, null),
    byBucket: stageProductsByBucket(orders, agg, keys),
    orderCount: orders.length,
  };
}
