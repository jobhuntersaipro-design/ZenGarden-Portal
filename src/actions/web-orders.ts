"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { WebOrderStatus } from "@/generated/prisma/enums";
import { writePurchaseOrder } from "@/actions/purchase-orders";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { shopPath } from "@/lib/shop-routes";
import {
  PoDraftSchema,
  checkTotals,
  confirmOptionsSchema,
  type PoDraft,
} from "@/lib/validation/purchase-orders";
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
  options: { totalsAcknowledged?: boolean } = {},
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
  const parsedOptions = confirmOptionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    return { success: false, error: "That order could not be saved." };
  }
  const data = parsedDraft.data;
  const { totalsAcknowledged } = parsedOptions.data;

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
    const poId = await prisma.$transaction(async (tx) => {
      const order = await tx.webOrder.findUnique({
        where: { id: webOrderId },
        select: { id: true, status: true, buyerId: true, buyerReference: true },
      });
      if (!order) throw new Error("MISSING_ORDER");
      if (order.status !== WebOrderStatus.SUBMITTED) {
        throw new Error("ALREADY_REVIEWED");
      }

      const written = await writePurchaseOrder(tx, {
        data,
        buyerId: order.buyerId,
        // No scan behind it. Nullable since Phase 16 precisely so this does
        // not have to invent a Document naming an object nobody uploaded.
        documentId: null,
        confirmedById: user.id,
        revision: 1,
        revisionOfId: null,
        totals,
        totalsAcknowledged: totalsAcknowledged === true,
        buyerReference: order.buyerReference,
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

      return written;
    });

    revalidatePath("/purchase-orders");
    revalidatePath("/");
    revalidatePath(shopPath.orders());
    return { success: true, data: { poId } };
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
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[web-orders] declineWebOrder", cause);
    return { success: false, error: "We couldn't decline that order." };
  }
}
