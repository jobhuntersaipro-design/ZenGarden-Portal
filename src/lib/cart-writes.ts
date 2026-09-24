import { Prisma } from "@/generated/prisma/client";
import { WebOrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { webOrderReference } from "@/lib/web-order-number";

/**
 * The cart's writes and its orderability rule, shared by `src/actions/cart.ts`
 * and `src/actions/reorder.ts` (Phase 57). Moved out of the cart action
 * rather than copied, because a `"use server"` module may export only async
 * actions, and a second copy of a visibility rule is how two go out of step
 * (`submitWebOrder` was found carrying one on 2026-09-23).
 */

/** Reused by both the single-product and the batch (merge) orderability checks. */
export const ORDERABLE_PRODUCT_SELECT = {
  id: true,
  active: true,
  needsReview: true,
  listPrice: true,
  market: true,
} as const;

/**
 * Whether this client may order this product.
 *
 * The market is a **required** second argument rather than something read
 * inside, and that is the enforcement: every caller has to have the buyer's
 * own market in hand, and `tsc` finds any that does not. A `null` market —
 * a buyer nobody has assigned one — returns false for every product, so the
 * rule fails closed by construction and not by a caller remembering to
 * check first.
 *
 * `submitWebOrder` used to inline these conditions rather than call this,
 * which is exactly how a fourth copy of a rule goes out of step with the
 * other three; it calls this now.
 */
export const isOrderable = (
  product: {
    active: boolean;
    needsReview: boolean;
    listPrice: Prisma.Decimal;
    market: string | null;
  },
  buyerMarket: string | null,
) =>
  product.active &&
  !product.needsReview &&
  product.listPrice.greaterThan(0) &&
  buyerMarket !== null &&
  product.market === buyerMarket;

/**
 * A product is orderable only while it is in the shop. Checked on every write
 * as well as on render, because a product can be archived or priced out while
 * a cart sits open.
 */
export async function orderableProduct(productId: string, buyerMarket: string | null) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: ORDERABLE_PRODUCT_SELECT,
  });
  if (!product || !isOrderable(product, buyerMarket)) return null;
  return product;
}

/**
 * The client's open cart, created on first use.
 *
 * A partial unique index enforces one DRAFT per client, so a double-click that
 * races two creates loses one to a P2002 and re-reads rather than opening two
 * carts.
 */
export async function openCart(placedById: string, buyerId: string) {
  const existing = await prisma.webOrder.findFirst({
    where: { placedById, status: WebOrderStatus.DRAFT },
    select: { id: true },
  });
  if (existing) return existing;

  try {
    // The reference is minted at creation from the row's own serial, so it is
    // unique by construction — no counter table and no locking.
    const created = await prisma.webOrder.create({
      data: { buyerId, placedById, reference: "" },
      select: { id: true, seq: true },
    });
    return await prisma.webOrder.update({
      where: { id: created.id },
      data: { reference: webOrderReference(created.seq) },
      select: { id: true },
    });
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      const raced = await prisma.webOrder.findFirst({
        where: { placedById, status: WebOrderStatus.DRAFT },
        select: { id: true },
      });
      if (raced) return raced;
    }
    throw cause;
  }
}

/**
 * Adds a line to an already-open cart, or increments it if the product is
 * already on the order. `@@unique([webOrderId, productId])` is what makes
 * adding the same product twice one line rather than a duplicate row — shared
 * by `addToCart` and `mergeGuestCart` so a merge behaves exactly like a click
 * would have, line by line.
 *
 * Takes the Prisma client to write through rather than reaching for the
 * module-level `prisma` itself: `addToCart` passes `prisma` directly,
 * `mergeGuestCart` passes a `$transaction` callback's `tx`, so every line of
 * a merge commits together or not at all.
 */
export async function upsertLine(
  client: Prisma.TransactionClient,
  cartId: string,
  productId: string,
  cartons: number,
) {
  await client.webOrderLine.upsert({
    where: { webOrderId_productId: { webOrderId: cartId, productId } },
    create: { webOrderId: cartId, productId, cartons },
    update: { cartons: { increment: cartons } },
  });
}
