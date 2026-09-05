import { shareBy, type ShareSlice } from "@/lib/analytics/share";
import type { AnalyticsOrder } from "@/lib/analytics/types";

export type MixMeasure = "value" | "qty";

/**
 * What a buyer buys, by money or by units. Same top-5-plus-Other folding as
 * the dashboard donuts, so the two read as one idea.
 */
export function productMix(
  orders: AnalyticsOrder[],
  measure: MixMeasure,
): ShareSlice[] {
  return shareBy(
    orders.flatMap((order) => order.lineItems),
    (line) =>
      line.productId
        ? { id: line.productId, label: line.productName ?? line.productId }
        : null,
    (line) => (measure === "value" ? line.amount : line.quantity),
  );
}
