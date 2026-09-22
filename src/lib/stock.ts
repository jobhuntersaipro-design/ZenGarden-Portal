/**
 * The stock ledger's rules, with no Prisma in sight so they can be tested
 * against rows rather than against a mock (Phase 55).
 *
 * A count belongs to the day it is a count *of*, not the day it was typed, so
 * entering last Tuesday's figure today is an ordinary count rather than a
 * special case. A count for a day that already has one does not overwrite it:
 * it writes a new row naming the one it corrects, so the ledger is its own log
 * and nothing anybody entered is ever destroyed.
 */

export type StockCountRow = {
  id: string;
  countedOn: string;
  cartons: number;
  note: string | null;
  countedByName: string | null;
  countedByImage?: string | null;
  createdAt: string;
  /** The row this one corrects, if it corrects one. */
  supersedesId: string | null;
  /** Set when a later row corrects this one. */
  supersededById: string | null;
};

/** The rows that still stand — what the trend draws and the figures read. */
export const currentCounts = (rows: StockCountRow[]): StockCountRow[] =>
  rows.filter((row) => row.supersededById === null);

/**
 * The count that `Product.stockCartons` caches: the current row with the
 * latest `countedOn`. Ties break on `createdAt`, so two counts entered for the
 * same day resolve to the one typed last — which, being a correction, is the
 * one that supersedes the other anyway.
 */
export function latestCount(rows: StockCountRow[]): StockCountRow | null {
  const current = currentCounts(rows);
  if (current.length === 0) return null;
  return current.reduce((best, row) =>
    row.countedOn > best.countedOn ||
    (row.countedOn === best.countedOn && row.createdAt > best.createdAt)
      ? row
      : best,
  );
}

/**
 * The trend: one point per day counted, oldest first.
 *
 * Deliberately not filled forward into days nobody counted. A stocktake is a
 * measurement, and drawing a flat line between two counts would assert that
 * nothing moved in between, which is the one thing a stock count cannot say.
 */
export const stockTrend = (rows: StockCountRow[]) =>
  currentCounts(rows)
    .map((row) => ({ date: row.countedOn, cartons: row.cartons }))
    .sort((a, b) => a.date.localeCompare(b.date));

export type StockActivity = {
  id: string;
  countedOn: string;
  cartons: number;
  /** What the corrected row said, when this row corrects one. */
  previous: number | null;
  note: string | null;
  countedByName: string | null;
  countedByImage?: string | null;
  createdAt: string;
  superseded: boolean;
};

/**
 * The feed, newest entry first — by when it was *typed*, not by the day it
 * counts, so a correction to a past date appears where the work happened.
 */
export function stockActivity(rows: StockCountRow[]): StockActivity[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return [...rows]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((row) => ({
      id: row.id,
      countedOn: row.countedOn,
      cartons: row.cartons,
      previous: row.supersedesId
        ? (byId.get(row.supersedesId)?.cartons ?? null)
        : null,
      note: row.note,
      countedByName: row.countedByName,
      countedByImage: row.countedByImage ?? null,
      createdAt: row.createdAt,
      superseded: row.supersededById !== null,
    }));
}

/** How the feed reads a row. Kept here so the screen cannot word it twice. */
export function describeStockCount(entry: StockActivity): string {
  const cartons = `${entry.cartons.toLocaleString("en-MY")} cartons`;
  return entry.previous === null
    ? `counted ${cartons}`
    : `corrected ${entry.previous.toLocaleString("en-MY")} to ${cartons}`;
}
