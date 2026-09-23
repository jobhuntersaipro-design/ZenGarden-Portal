/**
 * The fields the Demand Board's one search box looks in.
 *
 * It lives here rather than inside either query because **both boards on that
 * page read the same box**: the committed table and the stage board sit under
 * one toolbar, so a search that found a buyer on one and not the other would
 * be one control meaning two things. Sharing the list is what makes them
 * agree by construction rather than by two lists being kept in step.
 *
 * Every part is optional because the two boards reach different halves of it:
 * a stage-board line that matched no product carries none of the product
 * fields and is still findable by its buyer or its number.
 */
export function boardHaystack(parts: {
  sku?: string | null;
  name?: string | null;
  variant?: string | null;
  market?: string | null;
  familyCode?: string | null;
  familyName?: string | null;
  buyerName?: string | null;
  label?: string | null;
  orderIdLabel?: string | null;
}): string {
  return [
    parts.sku,
    parts.name,
    parts.variant,
    parts.market,
    parts.familyCode,
    parts.familyName,
    parts.buyerName,
    parts.label,
    parts.orderIdLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
