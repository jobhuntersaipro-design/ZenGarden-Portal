/**
 * What the toast says after a reorder: how many lines landed, and by name
 * what did not — "3 lines added to your cart — 1 no longer available: ZEN 1L
 * — Goat's Milk". A skipped line is never left for the buyer to notice by its
 * absence from the cart.
 */
export function reorderMessage(added: number, skipped: string[]): string {
  const head = `${added} ${added === 1 ? "line" : "lines"} added to your cart`;
  if (skipped.length === 0) return head;
  return `${head} — ${skipped.length} no longer available: ${skipped.join(", ")}`;
}
