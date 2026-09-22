/**
 * A multi-series trend over the page's own buckets (Phase 53 §3).
 *
 * Generalised out of Phase 07's `unitsPerBucket`, which drew units per product
 * on the buyer page and was already generic in everything but its name and its
 * hardcoded `line.quantity`. The dashboard needs the same shape for markets,
 * buyers and products against either money or units, so the subject and the
 * measure became arguments rather than a second copy of the walk.
 *
 * Pure: no Prisma, no I/O.
 */

import type { Aggregation } from "@/lib/dates";
import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";
import type { AnalyticsLineItem, AnalyticsOrder } from "@/lib/analytics/types";

/** One row per bucket; each selected series id is a key on it. */
export type TrendPoint = { key: string; label: string } & Record<
  string,
  string | number
>;

/**
 * What a line contributes to, and how much. Returning `null` drops the line —
 * a line with no product contributes to no product series, and one whose
 * product carries no market contributes to no market series.
 */
export type SeriesKey = (
  line: AnalyticsLineItem,
  order: AnalyticsOrder,
) => string | null;

export type SeriesValue = (line: AnalyticsLineItem) => number;

/**
 * Value per bucket per series, over every bucket in the range — empty ones
 * included, so a quiet month is visibly quiet rather than absent.
 *
 * A series id not in `ids` is ignored rather than added: the caller has
 * already decided which six the palette can draw, and a seventh line would be
 * a colour the validator never signed off.
 */
export function seriesPerBucket(
  orders: AnalyticsOrder[],
  ids: string[],
  keyFn: SeriesKey,
  valueFn: SeriesValue,
  from: Date,
  to: Date,
  agg: Aggregation,
): TrendPoint[] {
  const buckets = makeBuckets(from, to, agg);
  const zero = Object.fromEntries(ids.map((id) => [id, 0]));
  const byKey = new Map<string, TrendPoint>(
    buckets.map((bucket) => [
      bucket.key,
      { key: bucket.key, label: bucket.label, ...zero },
    ]),
  );

  const wanted = new Set(ids);
  for (const order of orders) {
    const point = byKey.get(bucketKey(order.poDate, agg));
    // An order outside the buckets is an order outside the range; ignore it
    // rather than inventing a bucket the axis does not have.
    if (!point) continue;
    for (const line of order.lineItems) {
      const id = keyFn(line, order);
      if (id === null || !wanted.has(id)) continue;
      point[id] = (point[id] as number) + valueFn(line);
    }
  }

  return buckets.map((bucket) => byKey.get(bucket.key)!);
}

/* ------------------------------------------------------------------------ */
/* The three subjects the dashboard trends                                   */
/* ------------------------------------------------------------------------ */

export const TREND_SUBJECTS = ["market", "buyer", "product"] as const;
export type TrendSubject = (typeof TREND_SUBJECTS)[number];

export const TREND_SUBJECT_LABEL: Record<TrendSubject, string> = {
  market: "Market",
  buyer: "Buyer",
  product: "Product",
};

/** One option in the trend's picker, ranked by the measure being drawn. */
export type SeriesOption = { id: string; name: string; value: number };

/**
 * A subject's own key function.
 *
 * Buyer is keyed off the order rather than the line, because a buyer is a
 * property of the document; market and product come off the line, because
 * that is where they live. A buyer line still contributes only its own
 * amount, so a filtered page's buyer trend counts the filtered lines — which
 * is the §2.1 rule holding through the chart as well as the tiles.
 */
export const subjectKey = (subject: TrendSubject): SeriesKey => {
  switch (subject) {
    case "market":
      return (line) => line.market;
    case "buyer":
      return (_line, order) => order.buyerId;
    case "product":
      return (line) => line.productId;
  }
};

const subjectName = (
  subject: TrendSubject,
  line: AnalyticsLineItem,
  order: AnalyticsOrder,
): string => {
  switch (subject) {
    case "market":
      return line.market ?? "";
    case "buyer":
      return order.buyerName;
    case "product":
      return line.productName ?? line.productId ?? "";
  }
};

/**
 * Every series the subject has in the range, ranked by the measure.
 *
 * The caller passes the orders it wants ranked — the *unfiltered* ones for the
 * market picker, so narrowing to Vietnam never removes Mydin from the control
 * that would take you back, and the filtered ones for buyer and product, where
 * offering a series the chart would draw as flat zero is the worse failure.
 */
export function seriesOptions(
  orders: AnalyticsOrder[],
  subject: TrendSubject,
  valueFn: SeriesValue,
): SeriesOption[] {
  const keyFn = subjectKey(subject);
  const totals = new Map<string, SeriesOption>();

  for (const order of orders) {
    for (const line of order.lineItems) {
      const id = keyFn(line, order);
      if (id === null) continue;
      const entry = totals.get(id) ?? {
        id,
        name: subjectName(subject, line, order),
        value: 0,
      };
      entry.value += valueFn(line);
      totals.set(id, entry);
    }
  }

  return [...totals.values()]
    .map((option) => ({
      ...option,
      value: Math.round(option.value * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
