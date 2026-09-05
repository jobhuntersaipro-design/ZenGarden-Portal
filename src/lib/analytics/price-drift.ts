import type { AnalyticsOrder } from "@/lib/analytics/types";

export type DriftRow = {
  productId: string;
  productName: string;
  previousPrice: number;
  currentPrice: number;
  deltaPercent: number;
};

export type PriceDrift = {
  rows: DriftRow[];
  upCount: number;
  downCount: number;
  /** Products sold in both periods — the only ones that can be compared. */
  comparedCount: number;
};

const MAX_ROWS = 6;

/**
 * Mean **billed** unit price per product — line amount ÷ quantity, so a
 * discount shows up. The list price is not the question; what was actually
 * charged is.
 */
function meanBilledPrice(orders: AnalyticsOrder[]) {
  const totals = new Map<
    string,
    { name: string; amount: number; quantity: number }
  >();

  for (const order of orders) {
    for (const line of order.lineItems) {
      if (!line.productId || line.quantity <= 0) continue;
      const entry = totals.get(line.productId) ?? {
        name: line.productName ?? line.productId,
        amount: 0,
        quantity: 0,
      };
      entry.amount += line.amount;
      entry.quantity += line.quantity;
      totals.set(line.productId, entry);
    }
  }

  return new Map(
    [...totals.entries()].map(([id, entry]) => [
      id,
      { name: entry.name, price: entry.amount / entry.quantity },
    ]),
  );
}

export function priceDrift(
  current: AnalyticsOrder[],
  previous: AnalyticsOrder[],
): PriceDrift {
  const now = meanBilledPrice(current);
  const before = meanBilledPrice(previous);

  const rows: DriftRow[] = [];
  for (const [productId, currentEntry] of now) {
    const previousEntry = before.get(productId);
    // A product sold in only one period has no drift, just a price.
    if (!previousEntry || previousEntry.price === 0) continue;
    rows.push({
      productId,
      productName: currentEntry.name,
      previousPrice: previousEntry.price,
      currentPrice: currentEntry.price,
      deltaPercent:
        ((currentEntry.price - previousEntry.price) / previousEntry.price) * 100,
    });
  }

  // Biggest movement first, in either direction — the point is what moved.
  rows.sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent));

  return {
    rows: rows.slice(0, MAX_ROWS),
    upCount: rows.filter((row) => row.deltaPercent > 0).length,
    downCount: rows.filter((row) => row.deltaPercent < 0).length,
    comparedCount: rows.length,
  };
}
