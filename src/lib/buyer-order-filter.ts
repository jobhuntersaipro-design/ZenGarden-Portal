/**
 * Narrowing the buyer's own order list (Phase 57 J5): three chips and a
 * search. Pure and Prisma-free, because the toolbar that writes `?filter=` is
 * a client component and must not pull the query module into the browser
 * (the 2026-09-21 `DEMAND_SPAN` trap).
 */

export const BUYER_ORDER_FILTERS = ["all", "open", "delivered"] as const;
export type BuyerOrderFilter = (typeof BUYER_ORDER_FILTERS)[number];

export const BUYER_ORDER_FILTER_LABELS: Record<BuyerOrderFilter, string> = {
  all: "All orders",
  open: "In progress",
  delivered: "Delivered",
};

/** A value the URL names that is not a chip reads as no filter. */
export function parseBuyerOrderFilter(raw: string | undefined): BuyerOrderFilter {
  return (BUYER_ORDER_FILTERS as readonly string[]).includes(raw ?? "")
    ? (raw as BuyerOrderFilter)
    : "all";
}

/** The fields of an order the filter reads — a subset of `ClientOrder`. */
export type FilterableOrder = {
  kind: "confirmed" | "submitted" | "received" | "declined";
  stage: string | null;
  orderId: string | null;
  buyerReference: string | null;
};

/**
 * "In progress" is everything still to come: sent, received, or confirmed and
 * not yet delivered. A declined order is neither in progress nor delivered,
 * so it is only under All orders. The search reads the two identifiers a
 * buyer quotes — their own PO number and our Order ID — case-insensitively.
 */
export function matchesBuyerOrder(
  order: FilterableOrder,
  filter: BuyerOrderFilter,
  q: string,
): boolean {
  const delivered = order.kind === "confirmed" && order.stage === "DELIVERED";
  if (filter === "delivered" && !delivered) return false;
  if (filter === "open" && (delivered || order.kind === "declined")) return false;

  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [order.buyerReference, order.orderId].some((id) =>
    (id ?? "").toLowerCase().includes(needle),
  );
}
