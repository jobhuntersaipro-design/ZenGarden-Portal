import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { TIME_ZONE } from "@/lib/dates";

/**
 * `W-2609-00007` — the human reference for an order placed on the shop.
 *
 * Uniqueness comes from `WebOrder.seq`, a Postgres serial, so there is no
 * counter table and no locking, and gaps are fine. The `yymm` is readability
 * only, taken in Kuala Lumpur like every other date the portal shows: read in
 * UTC it would name the wrong month for the eight hours either side of
 * midnight.
 *
 * This is the order's **Order ID**, our tracking number, and never its PO
 * number: the buyer's own PO is `buyerReference`, and confirming no longer
 * copies this into `PurchaseOrder.poNumber` (2026-09-17).
 */
export function webOrderReference(seq: number, at: Date = new Date()): string {
  const kl = new TZDate(at, TIME_ZONE);
  return `W-${format(kl, "yyMM")}-${String(seq).padStart(5, "0")}`;
}
