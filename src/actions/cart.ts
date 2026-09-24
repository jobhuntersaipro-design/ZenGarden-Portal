"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { WebOrderStatus } from "@/generated/prisma/enums";
import { UnauthorizedError, requireClient } from "@/lib/auth-guards";
import { rolesWithPermission } from "@/lib/permissions/require";
import { lineTotal } from "@/lib/cartons";
import { WebOrderPlaced, webOrderPlacedSubject } from "@/emails/WebOrderPlaced";
import { WebOrderReceipt, webOrderReceiptSubject } from "@/emails/WebOrderReceipt";
import { sendEmail } from "@/lib/email";
import { preparePoEmail } from "@/lib/po-email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { shopPath } from "@/lib/shop-routes";
import { loadCart, type Cart } from "@/lib/queries/cart";
import {
  attachWebOrderDocument,
  type WebOrderDocument,
} from "@/lib/web-order-document";
import {
  isOrderable,
  openCart,
  orderableProduct,
  ORDERABLE_PRODUCT_SELECT,
  upsertLine,
} from "@/lib/cart-writes";
import type { GuestCartLine } from "@/lib/guest-cart";
import {
  addManyToCartSchema,
  addToCartSchema,
  guestCartLinesSchema,
  PO_NUMBER_REQUIRED,
  setCartonsSchema,
  submitOrderSchema,
  type SubmitOrderInput,
} from "@/lib/validation/cart";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

async function guard() {
  try {
    return { user: await requireClient() };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { error: cause.message };
    throw cause;
  }
}

const revalidateShop = () => {
  // The real path, not the one the browser asked for: revalidation keys on the
  // resolved route. src/lib/shop-routes.ts is the only place either is written.
  //
  // The whole storefront layout, not the cart and home pages alone: the
  // layout's `cartSummary` feeds the header badge, the mobile bar and every
  // "In cart (n)" button, and a Server Action's revalidation re-renders the
  // route the viewer is on into the action's own response only when that
  // route is covered — a product page was not, which is why `AddToCart` used
  // to follow up with a second full `router.refresh()` (Phase 30).
  revalidatePath(shopPath.home(), "layout");
};

export async function addToCart(input: {
  productId: string;
  cartons: number;
}): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = addToCartSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That quantity is not valid.",
    };
  }

  try {
    if (!(await orderableProduct(parsed.data.productId, user.market))) {
      // One message for every reason, deliberately: withdrawn, unpriced and
      // "not in your market" all read the same, so naming a product id in
      // another market cannot be used to learn that it exists.
      return { success: false, error: "That product is not available to order." };
    }
    const cart = await openCart(user.id, user.buyerId);
    await upsertLine(prisma, cart.id, parsed.data.productId, parsed.data.cartons);

    revalidateShop();
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[cart] addToCart", cause);
    return { success: false, error: "We couldn't add that to your order." };
  }
}

/**
 * Several variants of one product, in one action (Phase 39).
 *
 * `mergeGuestCart`'s shape rather than a loop over `addToCart`: one query for
 * every product instead of one per line, and one transaction, because a
 * failure halfway through N sequential upserts would leave some flavours in
 * the cart while the buyer's screen still showed the quantities they set — a
 * retry would then double what had already landed.
 *
 * A line whose product has left the shop is skipped and counted, never
 * silently dropped; the caller says so. Every line gone is a refusal, because
 * "added to your order" would be false.
 */
export async function addManyToCart(input: {
  lines: { productId: string; cartons: number }[];
}): Promise<ActionResult<{ added: number; skipped: number }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = addManyToCartSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those quantities are not valid.",
    };
  }

  try {
    const productIds = [...new Set(parsed.data.lines.map((line) => line.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: ORDERABLE_PRODUCT_SELECT,
    });
    const orderableIds = new Set(
      products
        .filter((product) => isOrderable(product, user.market))
        .map((product) => product.id),
    );

    const lines = parsed.data.lines.filter((line) => orderableIds.has(line.productId));
    const skipped = parsed.data.lines.length - lines.length;
    if (lines.length === 0) {
      return { success: false, error: "Those products are not available to order." };
    }

    const cart = await openCart(user.id, user.buyerId);
    await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        await upsertLine(tx, cart.id, line.productId, line.cartons);
      }
    });

    revalidateShop();
    return { success: true, data: { added: lines.length, skipped } };
  } catch (cause) {
    console.error("[cart] addManyToCart", cause);
    return { success: false, error: "We couldn't add those to your order." };
  }
}

/**
 * Moves a guest's `localStorage` cart into the account they just signed in
 * as, the moment `GuestCartMerge` finds one waiting. Every line is added
 * through `upsertLine` — the same upsert `addToCart` uses — so a product
 * already in the account's cart increments rather than duplicating. Lines
 * whose product has left the shop are skipped and counted, never silently
 * dropped.
 *
 * A genuinely empty cart returns without touching the database at all: no
 * `findMany`, no `openCart` — there is nothing to merge.
 */
export async function mergeGuestCart(
  lines: GuestCartLine[],
): Promise<ActionResult<{ merged: number; skipped: number }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = guestCartLinesSchema.safeParse(lines);
  if (!parsed.success) {
    return { success: false, error: "We couldn't merge your cart." };
  }
  if (parsed.data.length === 0) {
    return { success: true, data: { merged: 0, skipped: 0 } };
  }

  try {
    // One query for every line, not one per line.
    const productIds = [...new Set(parsed.data.map((line) => line.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: ORDERABLE_PRODUCT_SELECT,
    });
    const orderableIds = new Set(
      products
        .filter((product) => isOrderable(product, user.market))
        .map((product) => product.id),
    );

    const cart = await openCart(user.id, user.buyerId);

    const orderableLines = parsed.data.filter((line) => orderableIds.has(line.productId));
    const skipped = parsed.data.length - orderableLines.length;

    // One transaction for every orderable line: a failure halfway through N
    // sequential upserts used to return `{success:false}` with some lines
    // already merged, while the browser still held its un-cleared
    // `localStorage` cart — a retry would then double-add whatever had
    // already landed. Now it is all merged or none of it is.
    await prisma.$transaction(async (tx) => {
      for (const line of orderableLines) {
        await upsertLine(tx, cart.id, line.productId, line.cartons);
      }
    });

    revalidateShop();
    return { success: true, data: { merged: orderableLines.length, skipped } };
  } catch (cause) {
    console.error("[cart] mergeGuestCart", cause);
    return { success: false, error: "We couldn't merge your cart." };
  }
}

/**
 * Answers with the caller's re-priced cart. `ClientCart` renders that at
 * once, so the stepper unlocks when this action returns rather than after a
 * full route refresh has re-run the layout's reads and the page's — one
 * `loadCart` here is cheaper than the six reads a refresh costs, and the
 * buyer is no longer waiting on the refresh at all (Phase 30).
 */
export async function setCartons(input: {
  productId: string;
  cartons: number;
}): Promise<ActionResult<Cart>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = setCartonsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That quantity is not valid.",
    };
  }

  try {
    // Scoped to the caller's own DRAFT, so a guessed line id reaches nothing.
    const updated = await prisma.webOrderLine.updateMany({
      where: {
        productId: parsed.data.productId,
        webOrder: { placedById: user.id, status: WebOrderStatus.DRAFT },
      },
      data: { cartons: parsed.data.cartons },
    });
    if (updated.count === 0) {
      return { success: false, error: "That line is no longer in your order." };
    }
    revalidateShop();
    return { success: true, data: await loadCart(user.id, user.market) };
  } catch (cause) {
    console.error("[cart] setCartons", cause);
    return { success: false, error: "We couldn't change that quantity." };
  }
}

/** Same contract as `setCartons`: the re-priced cart comes back with the answer. */
export async function removeFromCart(productId: string): Promise<ActionResult<Cart>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    await prisma.webOrderLine.deleteMany({
      where: {
        productId,
        webOrder: { placedById: user.id, status: WebOrderStatus.DRAFT },
      },
    });
    revalidateShop();
    return { success: true, data: await loadCart(user.id, user.market) };
  } catch (cause) {
    console.error("[cart] removeFromCart", cause);
    return { success: false, error: "We couldn't remove that line." };
  }
}

export async function clearCart(): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    await prisma.webOrderLine.deleteMany({
      where: { webOrder: { placedById: user.id, status: WebOrderStatus.DRAFT } },
    });
    revalidateShop();
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[cart] clearCart", cause);
    return { success: false, error: "We couldn't empty your order." };
  }
}

/**
 * Turn the cart into an order the ops team can see.
 *
 * This is the only place a price is written. Everything before it reads the
 * catalogue live, so the figures the client agreed to are the ones snapshotted
 * here, inside the transaction, and cannot have drifted in between.
 */
export async function submitWebOrder(
  // No default (2026-09-20): the PO number is required, and a default `{}`
  // would let a caller send an order carrying none.
  input: SubmitOrderInput,
): Promise<ActionResult<{ reference: string }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = submitOrderSchema.safeParse(input);
  if (!parsed.success) {
    // A missing PO number says so by name. The form refuses it first; this is
    // the guard for anything that calls the action directly.
    const missingPo = parsed.error.issues.some(
      (issue) => issue.path[0] === "buyerReference",
    );
    return {
      success: false,
      error: missingPo ? PO_NUMBER_REQUIRED : "That order could not be sent.",
    };
  }

  try {
    const placed = await prisma.$transaction(async (tx) => {
      const cart = await tx.webOrder.findFirst({
        where: { placedById: user.id, status: WebOrderStatus.DRAFT },
        select: {
          id: true,
          reference: true,
          lines: {
            select: {
              id: true,
              cartons: true,
              product: {
                select: {
                  packSize: true,
                  unit: true,
                  ...ORDERABLE_PRODUCT_SELECT,
                },
              },
            },
          },
        },
      });
      if (!cart) throw new Error("EMPTY");
      if (cart.lines.length === 0) throw new Error("EMPTY");

      // The shared predicate, not a fourth copy of its conditions: this is
      // the last gate before a price is written, and a line whose product
      // has left the buyer's market must not get through it. Re-checked here
      // rather than trusted from the add, because ops can move a market
      // while a cart sits open.
      const unavailable = cart.lines.find(
        (line) => !isOrderable(line.product, user.market),
      );
      if (unavailable) throw new Error("UNAVAILABLE");

      let subtotal = new Prisma.Decimal(0);
      for (const line of cart.lines) {
        const price = line.product.listPrice.toFixed(2);
        const amount = lineTotal(line.cartons, price);
        subtotal = subtotal.plus(new Prisma.Decimal(amount));
        await tx.webOrderLine.update({
          where: { id: line.id },
          data: {
            packSize: line.product.packSize,
            unit: line.product.unit,
            unitPrice: new Prisma.Decimal(price),
            amount: new Prisma.Decimal(amount),
          },
        });
      }

      await tx.webOrder.update({
        where: { id: cart.id },
        data: {
          status: WebOrderStatus.SUBMITTED,
          submittedAt: new Date(),
          subtotal,
          // Already trimmed and non-empty by the schema.
          buyerReference: parsed.data.buyerReference,
          notes: parsed.data.notes?.trim() || null,
        },
      });

      return { id: cart.id, reference: cart.reference };
    });

    revalidateShop();
    revalidatePath(shopPath.orders());
    revalidatePath("/purchase-orders");
    revalidatePath("/");

    // After the response, so the client is not kept waiting on a PDF render
    // and on Resend. Both steps swallow their own failures — the order is
    // already saved, and neither a missing file nor a missing email may read
    // back to the buyer as an order that did not go.
    after(async () => {
      const file = await attachWebOrderDocument(placed.id);
      await notify(placed.reference, file);
    });

    return { success: true, data: { reference: placed.reference } };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message === "EMPTY") {
      return { success: false, error: "Your order is empty." };
    }
    if (message === "UNAVAILABLE") {
      return {
        success: false,
        error: "One of your lines is no longer available. Remove it and try again.",
      };
    }
    console.error("[cart] submitWebOrder", cause);
    return { success: false, error: "We couldn't send your order." };
  }
}

/**
 * Tell the ops team an order is waiting, and the client that we have it.
 *
 * The ops list is wider than `queueAccessRequest`'s, which mails super admins
 * only: an order is work for whoever is on the queue, not a decision for an
 * administrator. The client's own copy is Phase 32 — the sent screen promises
 * it by name, so it is sent from the same place and on the same read.
 *
 * Both go through `sendEmail`, which never throws, inside `after()`. A failed
 * notification is a missing nudge, not a lost order.
 *
 * Since Phase 37 both carry the purchase order itself. `file` is null when the
 * render or the upload failed, and then both mails go **without** it rather
 * than not at all: an order the buyer placed must produce a receipt whatever
 * happened to its PDF.
 */
async function notify(
  reference: string,
  file: WebOrderDocument | null,
): Promise<void> {
  try {
    const order = await prisma.webOrder.findUnique({
      where: { reference },
      select: {
        reference: true,
        // Names the order in both emails' subject and heading (2026-09-20).
        buyerReference: true,
        buyer: { select: { name: true } },
        placedBy: { select: { name: true, email: true } },
        id: true,
      },
    });
    if (!order) return;

    // Rendered once and shared: the team and the buyer get the same preview.
    const po = await preparePoEmail(order.id, order.reference, file);

    // Whoever can see the queue, read off the grid — not a hardcoded pair of
    // roles. This said `[MEMBER, SUPER_ADMIN]` from Phase 16 until 2026-09-23,
    // which was every ops role there was; Phase 48 then added Production
    // planner, QC and Warehouse, all three of which hold `po.view` by default
    // and watch the review queue, and none of which was ever told an order had
    // arrived. Asking the permission rather than naming the roles is also what
    // stops the next role added from reopening the same hole.
    const staff = await prisma.user.findMany({
      where: {
        role: { in: await rolesWithPermission("po.view") },
        disabledAt: null,
      },
      select: { email: true },
    });

    if (staff.length > 0) {
      await sendEmail({
        to: staff.map((person) => person.email),
        subject: webOrderPlacedSubject(
          order.buyer.name,
          order.buyerReference,
          order.reference,
        ),
        attachments: po.attachments,
        react: WebOrderPlaced({
          reference: order.reference,
          poNumber: order.buyerReference,
          buyerName: order.buyer.name,
          placedByName: order.placedBy.name,
          reviewUrl: `${env.APP_URL}/web-orders/${order.id}`,
          document: po.document,
          buyerLogo: po.buyerLogo,
          preview: po.preview,
          attached: po.attached,
        }),
      });
    }

    // The client's copy links to the shop host, not the portal: that is the
    // only host their session exists on (Phase 15 — the cookie is host-only).
    await sendEmail({
      to: [order.placedBy.email],
      subject: webOrderReceiptSubject(order.buyerReference, order.reference),
      attachments: po.attachments,
      react: WebOrderReceipt({
        reference: order.reference,
        poNumber: order.buyerReference,
        orderUrl: `${env.SHOP_URL ?? env.APP_URL}/orders/${order.id}`,
        // Said only when it is true, so the email never promises a file that
        // is not on it.
        attached: po.attached,
        document: po.document,
        buyerLogo: po.buyerLogo,
        preview: po.preview,
      }),
    });
  } catch (cause) {
    console.error("[cart] notify", cause);
  }
}
