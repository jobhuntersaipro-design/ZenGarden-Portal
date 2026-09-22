import type { PoStage } from "@/generated/prisma/enums";
import { PO_STAGES } from "@/lib/po-stages";
import {
  openAt,
  type Snapshot,
  type StageOrder,
} from "@/lib/analytics/stage-history";

/**
 * One product, and how many of the period's orders carrying it stand at each
 * stage. `total` is the row's own order count, not the sum of a column — the
 * same order appears once per distinct product it carries, so the column
 * totals add up to more orders than exist and are never summed anywhere.
 */
export type StageProductRow = {
  productId: string;
  productName: string;
  total: number;
} & Record<PoStage, number>;

/** The remainder row: lines that matched no product at all. */
export const NO_PRODUCT = "*none";

const NO_PRODUCT_NAME = "No product matched";

function emptyRow(productId: string, productName: string): StageProductRow {
  const row = { productId, productName, total: 0 } as StageProductRow;
  for (const stage of PO_STAGES) row[stage] = 0;
  return row;
}

/**
 * The matrix behind one bar of the stage chart: for the orders open at the
 * end of that period, one row per product with that product's orders counted
 * into the stage each one stood at *then*.
 *
 * **An order counts once per product, never once per line.** A document that
 * prints the same product twice is still one order standing at one stage, so
 * a repeated line would double it — the same rule the demand board's
 * breakdown follows. Across *different* products it does count more than
 * once, deliberately: the question a row answers is "how many orders carrying
 * this product are at each stage", and an order carrying three products is
 * genuinely in flight for all three.
 */
export function stageByProduct(
  orders: StageOrder[],
  end: Date,
): StageProductRow[] {
  const rows = new Map<string, StageProductRow>();

  for (const { order, stage } of openAt(orders, end)) {
    const seen = new Set<string>();
    for (const line of order.lineItems) {
      const id = line.productId ?? NO_PRODUCT;
      if (seen.has(id)) continue;
      seen.add(id);

      const row =
        rows.get(id) ?? emptyRow(id, line.productName ?? NO_PRODUCT_NAME);
      row[stage] += 1;
      row.total += 1;
      rows.set(id, row);
    }
  }

  // Busiest first; the unmatched remainder is pinned last whatever the count,
  // like the catalogue's own "No market" row, because it is not a product and
  // leading the board with it would bury the products the reader came for.
  return [...rows.values()].sort(
    (a, b) =>
      (a.productId === NO_PRODUCT ? 1 : 0) -
        (b.productId === NO_PRODUCT ? 1 : 0) ||
      b.total - a.total ||
      a.productName.localeCompare(b.productName),
  );
}

/**
 * The same matrix for every bucket at once, keyed by bucket, so the card can
 * answer a hover from data it already holds rather than a round trip per bar.
 */
export function stageProductsByBucket(
  orders: StageOrder[],
  snapshots: Snapshot[],
): Record<string, StageProductRow[]> {
  return Object.fromEntries(
    snapshots.map((s) => [s.key, stageByProduct(orders, s.end)]),
  );
}
