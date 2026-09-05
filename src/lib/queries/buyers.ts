import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buyerStatus, type BuyerStatusClass } from "@/lib/analytics/buyer-status";
import { reorderSignals } from "@/lib/analytics/reorder";
import { monthlyTotals } from "@/lib/analytics/sparkline";
import type { AnalyticsOrder } from "@/lib/analytics/types";

export type BuyerRosterRow = {
  id: string;
  name: string;
  orders: number;
  total: number;
  overdue: number;
  averageOrder: number;
  lastOrderAt: string | null;
  cadenceDays: number | null;
  sparkline: number[];
  status: BuyerStatusClass;
  newUnknowable: boolean;
};

export type BuyerFilter = "lapsed" | "at-risk" | "overdue" | null;

export const BUYER_SORT_KEYS = [
  "name",
  "orders",
  "total",
  "overdue",
  "averageOrder",
  "lastOrderAt",
  "cadenceDays",
  "trend",
  "status",
] as const;

export type BuyerSortKey = (typeof BUYER_SORT_KEYS)[number];

/** Most urgent first, so a status sort surfaces who needs chasing. */
const STATUS_SEVERITY: Record<BuyerStatusClass, number> = {
  lapsed: 3,
  "at-risk": 2,
  new: 1,
  active: 0,
};

const LATEST_ONLY = { supersededBy: { is: null } } as const;

type OrderRow = {
  id: string;
  poNumber: string;
  buyerId: string;
  poDate: Date;
  total: Prisma.Decimal;
  stage: AnalyticsOrder["stage"];
  lineItems: { productId: string | null }[];
};

/**
 * The roster needs line items only for the overdue count, which reads product
 * ids and PO dates and nothing else. Selecting quantities, amounts and product
 * names too meant four Decimals and a join per line across every PO on record
 * — 2.1s on the seed against 0.4s without. Buyer detail loads the full shape,
 * for the one buyer it is showing.
 */
const toAnalytics = (row: OrderRow, buyerName: string): AnalyticsOrder => ({
  id: row.id,
  poNumber: row.poNumber,
  buyerId: row.buyerId,
  buyerName,
  poDate: row.poDate,
  total: row.total.toNumber(),
  stage: row.stage,
  lineItems: row.lineItems.map((line) => ({
    productId: line.productId,
    productName: null,
    quantity: 0,
    amount: 0,
  })),
  stageEvents: [],
});


export type BuyerRoster = {
  rows: BuyerRosterRow[];
  total: number;
  attention: { lapsed: number; atRisk: number; overdue: number };
  kpis: {
    buyersWithOrders: number;
    buyersOnRecord: number;
    newBuyers: number;
    newUnknowable: boolean;
    atRiskOrLapsed: number;
    lapsedCount: number;
    atRiskCount: number;
    revenuePerBuyer: number;
    rangeTotal: number;
  };
};

/**
 * Cadence and reorder signals are predictions about a buyer's rhythm, so both
 * read their **full** history rather than the range. That means one pass over
 * every PO — on this data, ~400 rows in a single round trip, which is cheaper
 * than a query per buyer and far cheaper than getting the answer wrong.
 *
 * Derived columns (status, overdue, cadence) only exist after that pass, so
 * sorting and paginating happen in memory afterwards rather than in SQL.
 */
export async function listBuyers(
  range: { from: Date; to: Date },
  previous: { from: Date; to: Date },
  filter: BuyerFilter,
  q: string | undefined,
  sort: { key: BuyerSortKey; dir: "asc" | "desc" },
  skip: number,
  take: number,
  now: Date = new Date(),
): Promise<BuyerRoster> {
  const [buyers, history] = await Promise.all([
    prisma.buyer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.purchaseOrder.findMany({
      where: LATEST_ONLY,
      select: {
        id: true,
        poNumber: true,
        buyerId: true,
        poDate: true,
        total: true,
        stage: true,
        lineItems: { select: { productId: true } },
      },
      orderBy: { poDate: "asc" },
    }),
  ]);

  const byBuyer = new Map<string, OrderRow[]>();
  for (const row of history) {
    const list = byBuyer.get(row.buyerId) ?? [];
    list.push(row as OrderRow);
    byBuyer.set(row.buyerId, list);
  }

  const recordStart = history.length > 0 ? history[0].poDate : null;
  const inRange = (date: Date, window: { from: Date; to: Date }) =>
    date >= window.from && date <= window.to;

  const all: BuyerRosterRow[] = buyers.map((buyer) => {
    const orders = (byBuyer.get(buyer.id) ?? []).map((row) =>
      toAnalytics(row, buyer.name),
    );
    const current = orders.filter((order) => inRange(order.poDate, range));
    const prior = orders.filter((order) => inRange(order.poDate, previous));

    const status = buyerStatus({
      current,
      previous: prior,
      history: orders,
      range,
      recordStart,
      now,
    });
    const { overdueCount } = reorderSignals(orders, now);
    const total = current.reduce((sum, order) => sum + order.total, 0);

    return {
      id: buyer.id,
      name: buyer.name,
      orders: current.length,
      total,
      overdue: overdueCount,
      averageOrder: current.length > 0 ? total / current.length : 0,
      lastOrderAt: status.lastOrderAt?.toISOString() ?? null,
      cadenceDays: status.cadenceDays,
      sparkline: monthlyTotals(current, range.from, range.to),
      status: status.klass,
      newUnknowable: status.newUnknowable,
    };
  });

  const attention = {
    lapsed: all.filter((row) => row.status === "lapsed").length,
    atRisk: all.filter((row) => row.status === "at-risk").length,
    overdue: all.filter((row) => row.overdue > 0).length,
  };

  const needle = q?.trim().toLowerCase();
  const filtered = all.filter((row) => {
    if (needle && !row.name.toLowerCase().includes(needle)) return false;
    if (filter === "lapsed") return row.status === "lapsed";
    if (filter === "at-risk") return row.status === "at-risk";
    if (filter === "overdue") return row.overdue > 0;
    return true;
  });

  const value = (row: BuyerRosterRow): number | string => {
    switch (sort.key) {
      case "name":
        return row.name.toLowerCase();
      case "orders":
        return row.orders;
      case "total":
        return row.total;
      case "overdue":
        return row.overdue;
      case "averageOrder":
        return row.averageOrder;
      case "lastOrderAt":
        return row.lastOrderAt ? Date.parse(row.lastOrderAt) : 0;
      case "cadenceDays":
        return row.cadenceDays ?? Number.MAX_SAFE_INTEGER;
      // Trend sorts by what the sparkline is drawn from, not by its shape.
      case "trend":
        return row.total;
      case "status":
        return STATUS_SEVERITY[row.status];
    }
  };

  const sorted = [...filtered].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const comparison =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
    return sort.dir === "asc" ? comparison : -comparison;
  });

  const withOrders = all.filter((row) => row.orders > 0);
  const rangeTotal = withOrders.reduce((sum, row) => sum + row.total, 0);

  return {
    rows: sorted.slice(skip, skip + take),
    total: sorted.length,
    attention,
    kpis: {
      buyersWithOrders: withOrders.length,
      buyersOnRecord: buyers.length,
      newBuyers: all.filter((row) => row.status === "new").length,
      // True when the record does not reach far enough back to tell.
      newUnknowable: all.some((row) => row.newUnknowable),
      atRiskOrLapsed: attention.lapsed + attention.atRisk,
      lapsedCount: attention.lapsed,
      atRiskCount: attention.atRisk,
      revenuePerBuyer:
        withOrders.length > 0 ? rangeTotal / withOrders.length : 0,
      rangeTotal,
    },
  };
}
