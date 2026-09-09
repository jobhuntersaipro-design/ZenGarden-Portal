import { lineAmount } from "@/lib/validation/purchase-orders";

/**
 * Cartons, and the pieces inside them.
 *
 * There is no unit conversion anywhere in this module, because there is none
 * to do: `Product.unit` is already `"carton"` and `listPrice` is already per
 * carton (`src/lib/catalog-import.ts`, and every row of `prisma/seed`). So the
 * client's cartons *are* `LineItem.quantity` and `listPrice` *is* `unitPrice`.
 * `packSize` only ever produces something to read.
 */

/** Pieces in an order line, or null where the catalogue does not say. */
export const piecesFor = (cartons: number, packSize: number | null): number | null =>
  packSize === null ? null : cartons * packSize;

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/** "6 per carton", or "per carton" when the pack size is unknown. */
export const unitLabel = (packSize: number | null, unit: string): string =>
  packSize === null ? `per ${unit}` : `${packSize} per ${unit}`;

/** "12 cartons · 72 pieces". The piece half is dropped when unknown. */
export function quantityCaption(
  cartons: number,
  packSize: number | null,
  unit: string,
): string {
  const pieces = piecesFor(cartons, packSize);
  const head = plural(cartons, unit);
  return pieces === null ? head : `${head} · ${plural(pieces, "piece")}`;
}

/**
 * What a line costs, as a money string. Goes through `lineAmount` so it is
 * Decimal arithmetic — a float here would put the totals gate one cent out,
 * which is the difference that gate exists to catch.
 */
export const lineTotal = (cartons: number, unitPrice: string): string =>
  lineAmount(String(cartons), unitPrice);
