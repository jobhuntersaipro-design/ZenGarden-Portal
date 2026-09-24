"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WebOrderStatus } from "@/generated/prisma/enums";
import { UnauthorizedError, requireClient } from "@/lib/auth-guards";
import {
  isOrderable,
  openCart,
  ORDERABLE_PRODUCT_SELECT,
  upsertLine,
} from "@/lib/cart-writes";
import { prisma } from "@/lib/prisma";
import { listBuyerOrders } from "@/lib/queries/web-orders";
import { shopPath } from "@/lib/shop-routes";
import { MAX_CARTONS_PER_LINE } from "@/lib/validation/cart";

/**
 * Ordering the same again (Phase 57 J1; Phase 20 §5, never built until now).
 *
 * Every line of the order goes through the cart's own `upsertLine`, so a
 * product already in the cart **increments** rather than duplicating, and
 * through the cart's own `isOrderable`, so a product that has left the buyer's
 * market since is skipped rather than slipped past the rule the cart's add
 * enforces. What is skipped is named, never dropped in silence.
 */

export type ReorderResult =
  | { success: true; data: { added: number; skipped: string[] } }
  | { success: false; error: string };

const reorderSchema = z.object({ id: z.string().min(1).max(64) });

type ReorderLine = { productId: string | null; cartons: number; name: string };

/** What an order asks for, read off whichever table holds it, scoped to the buyer. */
async function orderLines(buyerId: string, id: string): Promise<ReorderLine[] | null> {
  // The same lookup the order page makes (`loadBuyerOrder`): a purchase order
  // first, then a shop order the team has not confirmed. Both are scoped by
  // `buyerId` in the `where`, so another buyer's id finds nothing.
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, buyerId },
    select: {
      lineItems: {
        orderBy: { position: "asc" },
        select: {
          productId: true,
          quantity: true,
          description: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  if (po) {
    return po.lineItems.map((line) => ({
      productId: line.productId,
      // A scan's quantity is a decimal column. Anything not a whole number of
      // cartons cannot go into a cart, and is skipped and named below.
      cartons: Number(line.quantity.toFixed(3)),
      name: line.product?.name ?? line.description,
    }));
  }

  const web = await prisma.webOrder.findFirst({
    where: {
      id,
      buyerId,
      status: {
        in: [WebOrderStatus.SUBMITTED, WebOrderStatus.RECEIVED, WebOrderStatus.DECLINED],
      },
    },
    select: {
      lines: { select: { productId: true, cartons: true, product: { select: { name: true } } } },
    },
  });
  if (!web) return null;
  return web.lines.map((line) => ({
    productId: line.productId,
    cartons: line.cartons,
    name: line.product.name,
  }));
}

async function reorder(
  user: { id: string; buyerId: string; market: string | null },
  id: string,
): Promise<ReorderResult> {
  const lines = await orderLines(user.buyerId, id);
  if (!lines) return { success: false, error: "We couldn't find that order." };

  const productIds = [
    ...new Set(lines.map((line) => line.productId).filter((pid): pid is string => !!pid)),
  ];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: ORDERABLE_PRODUCT_SELECT,
  });
  const orderable = new Set(
    products.filter((product) => isOrderable(product, user.market)).map((p) => p.id),
  );

  // One cart line per product, as the cart itself keeps: a document that
  // printed a product twice asks for the two quantities together.
  const wanted = new Map<string, number>();
  const skipped: string[] = [];
  for (const line of lines) {
    const whole = Number.isInteger(line.cartons) && line.cartons >= 1;
    if (!line.productId || !orderable.has(line.productId) || !whole) {
      if (!skipped.includes(line.name)) skipped.push(line.name);
      continue;
    }
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.cartons);
  }

  if (wanted.size === 0) {
    return {
      success: false,
      error: "None of this order's products can be ordered now.",
    };
  }

  const cart = await openCart(user.id, user.buyerId);
  // All of it or none of it: a failure halfway would leave some lines in the
  // cart, and pressing again would double them.
  await prisma.$transaction(async (tx) => {
    for (const [productId, cartons] of wanted) {
      await upsertLine(tx, cart.id, productId, Math.min(cartons, MAX_CARTONS_PER_LINE));
    }
  });

  // The whole storefront layout: its cart summary feeds the header badge.
  revalidatePath(shopPath.home(), "layout");
  return { success: true, data: { added: wanted.size, skipped } };
}

async function guarded(run: (user: Awaited<ReturnType<typeof requireClient>>) => Promise<ReorderResult>) {
  let user;
  try {
    user = await requireClient();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false as const, error: cause.message };
    throw cause;
  }
  try {
    return await run(user);
  } catch (cause) {
    console.error("[reorder]", cause);
    return { success: false as const, error: "We couldn't add that order to your cart." };
  }
}

/** "Order these again" on one order's page. */
export async function reorderOrder(input: { id: string }): Promise<ReorderResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "We couldn't find that order." };
  return guarded((user) => reorder(user, parsed.data.id));
}

/**
 * The account menu's "Reorder your last order": the newest order on My orders,
 * by the same list and the same sort, so "last" means what the buyer sees at
 * the top of that page.
 */
export async function reorderLast(): Promise<ReorderResult> {
  return guarded(async (user) => {
    const { orders } = await listBuyerOrders(user.buyerId, 1, 1);
    const last = orders[0];
    if (!last) return { success: false, error: "You have no orders to repeat yet." };
    return reorder(user, last.id);
  });
}
