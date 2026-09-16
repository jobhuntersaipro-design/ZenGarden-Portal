"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { WebOrderStatus } from "@/generated/prisma/enums";
import { writePurchaseOrder } from "@/actions/purchase-orders";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { shopPath } from "@/lib/shop-routes";
import { attachWebOrderDocument } from "@/lib/web-order-document";
import {
  PoDraftSchema,
  checkTotals,
  webOrderConfirmOptionsSchema,
  type PoDraft,
} from "@/lib/validation/purchase-orders";
import {
  WebOrderConfirmed,
  webOrderConfirmedSubject,
} from "@/emails/WebOrderConfirmed";
import {
  WebOrderDeclined,
  webOrderDeclinedSubject,
} from "@/emails/WebOrderDeclined";
import {
  WebOrderReceived,
  webOrderReceivedSubject,
} from "@/emails/WebOrderReceived";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { z } from "zod";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

async function guard() {
  try {
    return { user: await requireUser() };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { error: cause.message };
    throw cause;
  }
}

const declineSchema = z.object({
  reason: z.string().trim().min(1, "Say why, so the buyer knows").max(500),
});

/**
 * Turn a shop order into a purchase order.
 *
 * The mirror of `confirmPurchaseOrder`: same draft schema, same totals gate,
 * same writer, same `ORDER_PLACED` event attributed to System. The only
 * differences are where the draft came from and that there is no document.
 */
export async function confirmWebOrder(
  webOrderId: string,
  draft: PoDraft,
  options: { totalsAcknowledged?: boolean; deliveryDate?: string },
): Promise<ActionResult<{ poId: string }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsedDraft = PoDraftSchema.safeParse(draft);
  if (!parsedDraft.success) {
    return {
      success: false,
      error: parsedDraft.error.issues[0]?.message ?? "That order could not be saved.",
    };
  }
  // The web-order schema, not the shared one: a delivery date is required
  // here and nowhere else. An uploaded purchase order may carry none, and
  // `confirmPurchaseOrder` still confirms without it.
  const parsedOptions = webOrderConfirmOptionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    return {
      success: false,
      error:
        parsedOptions.error.issues[0]?.path[0] === "deliveryDate"
          ? "An expected delivery date is required."
          : "That order could not be saved.",
    };
  }
  const data = parsedDraft.data;
  const { totalsAcknowledged, deliveryDate } = parsedOptions.data;

  const totals = checkTotals(data);
  if (!totals.matches && totalsAcknowledged !== true) {
    return { success: false, error: "The totals don't match the order." };
  }

  // The same gate confirmPurchaseOrder applies. Every line of a shop order
  // arrives already linked to a catalogue product, so in practice this only
  // fires where a reviewer has changed one.
  const undecided = data.lineItems.findIndex(
    (line) => line.productDecision === "unset",
  );
  if (undecided >= 0) {
    return {
      success: false,
      error: `Every line needs a product — line ${undecided + 1} is undecided.`,
    };
  }

  try {
    // Outside the transaction, because it renders a PDF and writes to R2.
    // Usually this is a read: the file was drawn when the order was sent, and
    // `attachWebOrderDocument` hands back the one that exists. It only draws
    // where that failed, which is how an order whose render hiccupped still
    // reaches its purchase order with a document attached. Null is fine —
    // `documentId` has been nullable since Phase 16 for exactly this.
    const file = await attachWebOrderDocument(webOrderId);

    const confirmed = await prisma.$transaction(async (tx) => {
      const order = await tx.webOrder.findUnique({
        where: { id: webOrderId },
        select: {
          id: true,
          status: true,
          buyerId: true,
          buyerReference: true,
          reference: true,
          placedBy: { select: { email: true } },
          _count: { select: { lines: true } },
        },
      });
      if (!order) throw new Error("MISSING_ORDER");
      if (order.status !== WebOrderStatus.SUBMITTED) {
        throw new Error("ALREADY_REVIEWED");
      }

      const written = await writePurchaseOrder(tx, {
        data,
        buyerId: order.buyerId,
        // The purchase order we generated ourselves, where there is one. This
        // is what puts a shop order's document on the ops detail page beside
        // an uploaded scan's.
        documentId: file?.documentId ?? null,
        confirmedById: user.id,
        revision: 1,
        revisionOfId: null,
        totals,
        totalsAcknowledged: totalsAcknowledged === true,
        buyerReference: order.buyerReference,
        deliveryDate,
      });

      await tx.webOrder.update({
        where: { id: order.id },
        data: {
          status: WebOrderStatus.CONFIRMED,
          purchaseOrderId: written,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });

      return { poId: written, order };
    });

    revalidatePath("/purchase-orders");
    revalidatePath("/");
    revalidatePath(shopPath.orders());

    // The buyer hears that their order is on, and when. Until Phase 38 they
    // heard nothing at all and had to come and look. After the response and
    // through sendEmail, which never throws: a failed email is a missing
    // nudge, not an unconfirmed order.
    after(async () => {
      await sendEmail({
        to: [confirmed.order.placedBy.email],
        subject: webOrderConfirmedSubject(confirmed.order.reference, formatDate(deliveryDate)),
        react: WebOrderConfirmed({
          reference: confirmed.order.reference,
          buyerReference: confirmed.order.buyerReference,
          poNumber: data.poNumber,
          expectedDelivery: formatDate(deliveryDate),
          lineCount: confirmed.order._count.lines,
          total: formatMYR(Number(data.total)),
          orderUrl: `${env.SHOP_URL ?? env.APP_URL}/orders/${confirmed.poId}`,
        }),
      });
    });

    return { success: true, data: { poId: confirmed.poId } };
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return { success: false, error: "This buyer already has a PO with that number." };
    }
    const message = cause instanceof Error ? cause.message : "";
    if (message === "ALREADY_REVIEWED") {
      return { success: false, error: "This one has already been reviewed." };
    }
    if (message === "MISSING_ORDER") {
      return { success: false, error: "That order is gone." };
    }
    if (message.startsWith("STALE_PRODUCT:")) {
      return {
        success: false,
        error: `The product chosen for line ${message.split(":")[1]} is no longer in the catalogue. Choose another.`,
      };
    }
    console.error("[web-orders] confirmWebOrder", cause);
    return { success: false, error: "We couldn't confirm that order." };
  }
}

/**
 * Acknowledge a shop order (Phase 41).
 *
 * The gap this closes: between the buyer sending an order and the team
 * committing to a delivery date, nothing in the product said a human had
 * seen it. `confirmWebOrder` now requires this to have happened.
 *
 * Any signed-in ops member may receive — this is the queue being worked, not
 * a super-admin act.
 */
export async function receiveWebOrder(
  webOrderId: string,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    // Guarded on the status the caller last saw, the same shape as
    // declineWebOrder and advanceStage.
    const updated = await prisma.webOrder.updateMany({
      where: { id: webOrderId, status: WebOrderStatus.SUBMITTED },
      data: {
        status: WebOrderStatus.RECEIVED,
        receivedById: user.id,
        receivedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      return { success: false, error: "This one has already been received." };
    }

    revalidatePath("/purchase-orders");
    revalidatePath("/");
    revalidatePath(shopPath.orders());
    revalidatePath(`/web-orders/${webOrderId}`);

    // Read after the update so the recipient is whoever actually placed it.
    const order = await prisma.webOrder.findUnique({
      where: { id: webOrderId },
      select: {
        reference: true,
        buyerReference: true,
        subtotal: true,
        placedBy: { select: { email: true } },
        _count: { select: { lines: true } },
      },
    });
    if (order) {
      after(async () => {
        await sendEmail({
          to: [order.placedBy.email],
          subject: webOrderReceivedSubject(order.reference),
          react: WebOrderReceived({
            reference: order.reference,
            buyerReference: order.buyerReference,
            lineCount: order._count.lines,
            total: formatMYR(order.subtotal.toNumber()),
            // Phase 15: the buyer's session is host-only, and it is the shop's.
            orderUrl: `${env.SHOP_URL ?? env.APP_URL}/orders/${webOrderId}`,
          }),
        });
      });
    }

    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[web-orders] receiveWebOrder", cause);
    return { success: false, error: "We couldn't receive that order." };
  }
}

/**
 * Close an order the team cannot accept.
 *
 * The reason is required and is shown to the buyer: an order that simply
 * disappears is worse than one that is refused with a sentence. Without this
 * the queue would grow rows nobody can clear.
 */
export async function declineWebOrder(
  webOrderId: string,
  input: { reason: string },
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Say why, so the buyer knows.",
    };
  }

  try {
    const updated = await prisma.webOrder.updateMany({
      // Guarded on the status the caller last saw, the same shape as
      // advanceStage: two people reviewing at once cannot both win.
      where: { id: webOrderId, status: WebOrderStatus.SUBMITTED },
      data: {
        status: WebOrderStatus.DECLINED,
        declinedReason: parsed.data.reason,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      return { success: false, error: "This one has already been reviewed." };
    }

    revalidatePath("/purchase-orders");
    revalidatePath("/");
    revalidatePath(shopPath.orders());

    // The form has promised since Phase 16 that "the buyer sees this", and
    // until now that was true only if they came looking. Read after the
    // update so the recipient is whoever actually placed it.
    const order = await prisma.webOrder.findUnique({
      where: { id: webOrderId },
      select: { reference: true, placedBy: { select: { email: true } } },
    });
    if (order) {
      after(async () => {
        await sendEmail({
          to: [order.placedBy.email],
          subject: webOrderDeclinedSubject(order.reference),
          react: WebOrderDeclined({
            reference: order.reference,
            reason: parsed.data.reason,
            orderUrl: `${env.SHOP_URL ?? env.APP_URL}/orders/${webOrderId}`,
          }),
        });
      });
    }

    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[web-orders] declineWebOrder", cause);
    return { success: false, error: "We couldn't decline that order." };
  }
}
