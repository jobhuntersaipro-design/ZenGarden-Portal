"use server";

import { EMPTY_CART, type Cart } from "@/lib/queries/cart";
import type { GuestCartLine } from "@/lib/guest-cart";

/**
 * A public action, reachable by a signed-out guest — it must never import
 * `@/lib/auth-guards` or anything else that reads a session. `src/actions/
 * cart.ts` guards every export with `requireClient()`; this file exists
 * precisely because a guest has none to check.
 */
export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Prices a guest's `localStorage` cart at today's list price, the same way
 * `loadCart` prices a client's — a guest's cart has no `WebOrder` row to read,
 * so this is called live instead of stored. A line whose product the
 * catalogue no longer holds is silently dropped rather than surfaced as an
 * error: the browser sent stale ids, not a request that failed.
 *
 * **Closed on 2026-09-23, and it now returns an empty cart to everyone.**
 *
 * The shop requires a sign-in since the catalogue became market-scoped, so
 * there is no guest to have a cart and `GuestCart` is unreachable. Leaving
 * this answering would have been the one hole in that decision: it looks a
 * product up by id rather than by browsing, so no catalogue filter applied
 * to it, and an unauthenticated caller could POST ids and read back each
 * product's name, brand, variant, market and pack size — exactly what
 * "a guest sees nothing" was chosen to prevent. A rule enforced only in the
 * UI is not enforced.
 *
 * It returns the empty cart rather than an error because nothing renders its
 * error: a refusal would surface nowhere and read as a fault. The export,
 * its schema and `GuestCart` are all kept so that reversing the sign-in
 * requirement is a matter of restoring this body (it is in git, at the
 * commit that closed it) rather than rebuilding the guest cart.
 */
export async function priceCart(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lines: GuestCartLine[],
): Promise<ActionResult<Cart>> {
  return { success: true, data: EMPTY_CART };
}
