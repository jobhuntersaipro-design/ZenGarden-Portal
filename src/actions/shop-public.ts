"use server";

import { prisma } from "@/lib/prisma";
import {
  EMPTY_CART,
  PRICED_PRODUCT_SELECT,
  priceProductLines,
  type Cart,
} from "@/lib/queries/cart";
import { guestCartLinesSchema } from "@/lib/validation/cart";
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
 */
export async function priceCart(lines: GuestCartLine[]): Promise<ActionResult<Cart>> {
  const parsed = guestCartLinesSchema.safeParse(lines);
  if (!parsed.success) return { success: false, error: "That cart could not be read." };
  if (parsed.data.length === 0) return { success: true, data: EMPTY_CART };

  try {
    const products = await prisma.product.findMany({
      where: { id: { in: parsed.data.map((line) => line.productId) } },
      // `id: true` added on top of the shared select — PRICED_PRODUCT_SELECT
      // has no id column of its own, but this is the only caller of
      // priceProductLines that has to look products up by id rather than
      // already knowing it from the row it read them through.
      select: { id: true, ...PRICED_PRODUCT_SELECT },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    const rows = parsed.data.flatMap((line) => {
      const product = byId.get(line.productId);
      return product ? [{ productId: line.productId, cartons: line.cartons, product }] : [];
    });

    return { success: true, data: { id: null, ...(await priceProductLines(rows)) } };
  } catch (cause) {
    console.error("[shop-public] priceCart", cause);
    return { success: false, error: "We couldn't price your cart." };
  }
}
