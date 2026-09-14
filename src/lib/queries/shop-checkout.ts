import { WebOrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/**
 * The two reads the checkout screens need (Phase 32).
 *
 * Both projections are **narrow and asserted by shape in the tests**, for the
 * reason Phase 23 pinned `loadShopViewer`: a `Buyer` carries `remark`, which
 * is an internal note, and a `WebOrder` carries `reviewedBy`, `declinedReason`
 * and the ops trail. None of that belongs on a screen a customer is reading,
 * so widening either select has to be a deliberate edit to one line.
 */

export type ReviewBuyer = {
  name: string;
  address: string | null;
  contactName: string | null;
  email: string | null;
  /** Printed on the purchase order. The buyer's own agreed terms. */
  paymentTerms: string | null;
};

/** Where the order will go — shown on review so the client can check it. */
export async function loadReviewBuyer(buyerId: string): Promise<ReviewBuyer | null> {
  const buyer = await prisma.buyer.findUnique({
    where: { id: buyerId },
    // Deliberately not `remark`: it is the ops team's private note.
    select: {
      name: true,
      address: true,
      contactName: true,
      email: true,
      paymentTerms: true,
    },
  });
  return buyer ?? null;
}

export type SentOrder = {
  id: string;
  reference: string;
  buyerReference: string | null;
  total: string;
  placedByEmail: string;
  submittedAt: Date | null;
};

/**
 * The order that was just sent, by its reference and scoped to the caller's
 * own buyer — so another company's reference, guessed or shared, finds
 * nothing rather than confirming that it exists.
 *
 * A DRAFT is excluded: until it is submitted there is no order to confirm,
 * and the reference on a draft is one the client has never been shown.
 */
export async function loadSentOrder(
  buyerId: string,
  reference: string,
): Promise<SentOrder | null> {
  const order = await prisma.webOrder.findFirst({
    where: {
      reference,
      buyerId,
      status: { in: [WebOrderStatus.SUBMITTED, WebOrderStatus.CONFIRMED] },
    },
    select: {
      id: true,
      reference: true,
      buyerReference: true,
      subtotal: true,
      submittedAt: true,
      placedBy: { select: { email: true } },
    },
  });
  if (!order) return null;

  return {
    id: order.id,
    reference: order.reference,
    buyerReference: order.buyerReference,
    total: order.subtotal.toFixed(2),
    placedByEmail: order.placedBy.email,
    submittedAt: order.submittedAt,
  };
}
