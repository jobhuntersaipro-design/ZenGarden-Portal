"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { WebOrderStatus } from "@/generated/prisma/enums";
import { UnauthorizedError, requireClient } from "@/lib/auth-guards";
import { lineTotal } from "@/lib/cartons";
import { Role } from "@/generated/prisma/enums";
import { WebOrderPlaced, webOrderPlacedSubject } from "@/emails/WebOrderPlaced";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { formatMYR } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { shopPath } from "@/lib/shop-routes";
import { webOrderReference } from "@/lib/web-order-number";
import {
  addToCartSchema,
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
  revalidatePath(shopPath.cart());
  revalidatePath(shopPath.home());
};

/**
 * A product is orderable only while it is in the shop. Checked on every write
 * as well as on render, because a product can be archived or priced out while
 * a cart sits open.
 */
async function orderableProduct(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, active: true, needsReview: true, listPrice: true },
  });
  if (
    !product ||
    !product.active ||
    product.needsReview ||
    product.listPrice.lessThanOrEqualTo(0)
  ) {
    return null;
  }
  return product;
}

/**
 * The client's open cart, created on first use.
 *
 * A partial unique index enforces one DRAFT per client, so a double-click that
 * races two creates loses one to a P2002 and re-reads rather than opening two
 * carts.
 */
async function openCart(placedById: string, buyerId: string) {
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
    if (!(await orderableProduct(parsed.data.productId))) {
      return { success: false, error: "That product is not available to order." };
    }
    const cart = await openCart(user.id, user.buyerId);

    // @@unique([webOrderId, productId]) makes adding the same product twice one
    // line rather than a duplicate row.
    await prisma.webOrderLine.upsert({
      where: {
        webOrderId_productId: {
          webOrderId: cart.id,
          productId: parsed.data.productId,
        },
      },
      create: {
        webOrderId: cart.id,
        productId: parsed.data.productId,
        cartons: parsed.data.cartons,
      },
      update: { cartons: { increment: parsed.data.cartons } },
    });

    revalidateShop();
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[cart] addToCart", cause);
    return { success: false, error: "We couldn't add that to your order." };
  }
}

export async function setCartons(input: {
  productId: string;
  cartons: number;
}): Promise<ActionResult> {
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
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[cart] setCartons", cause);
    return { success: false, error: "We couldn't change that quantity." };
  }
}

export async function removeFromCart(productId: string): Promise<ActionResult> {
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
    return { success: true, data: undefined };
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

/** How many open orders a buyer may have waiting on the ops team at once. */
const MAX_OPEN_ORDERS_PER_BUYER = 5;

/**
 * Turn the cart into an order the ops team can see.
 *
 * This is the only place a price is written. Everything before it reads the
 * catalogue live, so the figures the client agreed to are the ones snapshotted
 * here, inside the transaction, and cannot have drifted in between.
 */
export async function submitWebOrder(
  input: SubmitOrderInput = {},
): Promise<ActionResult<{ reference: string }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = submitOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "That order could not be sent." };
  }

  try {
    // src/lib/rate-limit.ts covers sign-in and password reset only, so the cap
    // lives here: a client cannot flood the review queue or the ops mailbox.
    const open = await prisma.webOrder.count({
      where: { buyerId: user.buyerId, status: WebOrderStatus.SUBMITTED },
    });
    if (open >= MAX_OPEN_ORDERS_PER_BUYER) {
      return {
        success: false,
        error: `You have ${open} orders waiting to be confirmed. The team will be in touch before you can send another.`,
      };
    }

    const reference = await prisma.$transaction(async (tx) => {
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
                  listPrice: true,
                  active: true,
                  needsReview: true,
                },
              },
            },
          },
        },
      });
      if (!cart) throw new Error("EMPTY");
      if (cart.lines.length === 0) throw new Error("EMPTY");

      const unavailable = cart.lines.find(
        (line) =>
          !line.product.active ||
          line.product.needsReview ||
          line.product.listPrice.lessThanOrEqualTo(0),
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
          buyerReference: parsed.data.buyerReference?.trim() || null,
          notes: parsed.data.notes?.trim() || null,
        },
      });

      return cart.reference;
    });

    revalidateShop();
    revalidatePath(shopPath.orders());
    revalidatePath("/purchase-orders");
    revalidatePath("/");

    // After the response, so the client is not kept waiting on Resend, and
    // through sendEmail, which never throws — a failed notification must not
    // undo an order that is already saved.
    after(async () => {
      await notifyOps(reference);
    });

    return { success: true, data: { reference } };
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
 * Tell the ops team an order is waiting.
 *
 * Wider than `queueAccessRequest`, which mails super admins only: an order is
 * work for whoever is on the queue, not a decision for an administrator.
 */
async function notifyOps(reference: string): Promise<void> {
  try {
    const order = await prisma.webOrder.findUnique({
      where: { reference },
      select: {
        reference: true,
        subtotal: true,
        buyer: { select: { name: true } },
        placedBy: { select: { name: true } },
        _count: { select: { lines: true } },
        id: true,
      },
    });
    if (!order) return;

    const staff = await prisma.user.findMany({
      where: {
        role: { in: [Role.MEMBER, Role.SUPER_ADMIN] },
        disabledAt: null,
      },
      select: { email: true },
    });
    if (staff.length === 0) return;

    await sendEmail({
      to: staff.map((person) => person.email),
      subject: webOrderPlacedSubject(order.buyer.name),
      react: WebOrderPlaced({
        reference: order.reference,
        buyerName: order.buyer.name,
        placedByName: order.placedBy.name,
        lineCount: order._count.lines,
        total: formatMYR(order.subtotal.toNumber()),
        reviewUrl: `${env.APP_URL}/web-orders/${order.id}`,
      }),
    });
  } catch (cause) {
    // Never surfaced: the order is already saved and the queue entry already
    // shows it. A failed email is a missing nudge, not a lost order.
    console.error("[cart] notifyOps", cause);
  }
}
