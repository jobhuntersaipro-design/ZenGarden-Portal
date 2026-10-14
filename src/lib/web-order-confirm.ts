import { WebOrderStatus } from "@/generated/prisma/enums";
import { writePurchaseOrder } from "@/actions/purchase-orders";
import {
  WebOrderConfirmed,
  webOrderConfirmedSubject,
} from "@/emails/WebOrderConfirmed";
import { allGreen } from "@/lib/certification";
import { formatDate, todayISO } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { formatMYR } from "@/lib/money";
import { paymentTermsDaysInput } from "@/lib/payment-terms";
import { preparePoEmail } from "@/lib/po-email";
import { prisma } from "@/lib/prisma";
import { loadProductCerts } from "@/lib/queries/certificates";
import { loadWebOrderForReview } from "@/lib/queries/web-orders";
import {
  WebOrderDraftSchema,
  checkTotals,
  type PoDraft,
} from "@/lib/validation/purchase-orders";
import {
  attachWebOrderDocument,
  type WebOrderDocument,
} from "@/lib/web-order-document";

/**
 * The confirm itself, shared by a person pressing Confirm (`confirmWebOrder`)
 * and by auto-approval (2026-10-14). Validation and permission are the
 * caller's; this writes the purchase order and marks the shop order
 * CONFIRMED in one transaction. `confirmedById` null means auto-approved.
 *
 * Throws `MISSING_ORDER`, `ALREADY_REVIEWED`, or the writer's own errors.
 */
export async function confirmWebOrderAs(input: {
  webOrderId: string;
  data: PoDraft;
  totals: ReturnType<typeof checkTotals>;
  totalsAcknowledged: boolean;
  deliveryDate: string | null;
  confirmedById: string | null;
  documentId: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.webOrder.findUnique({
      where: { id: input.webOrderId },
      select: {
        id: true,
        status: true,
        buyerId: true,
        buyerReference: true,
        reference: true,
        placedBy: { select: { email: true } },
      },
    });
    if (!order) throw new Error("MISSING_ORDER");
    // Straight from SUBMITTED since the Receive step was removed
    // (2026-09-17). RECEIVED is still accepted: orders received before then
    // still exist and still need confirming.
    if (order.status !== WebOrderStatus.SUBMITTED && order.status !== WebOrderStatus.RECEIVED) {
      throw new Error("ALREADY_REVIEWED");
    }

    const written = await writePurchaseOrder(tx, {
      data: input.data,
      buyerId: order.buyerId,
      documentId: input.documentId,
      confirmedById: input.confirmedById,
      revision: 1,
      revisionOfId: null,
      totals: input.totals,
      totalsAcknowledged: input.totalsAcknowledged,
      buyerReference: order.buyerReference,
      deliveryDate: input.deliveryDate,
    });

    // Guarded on the status read above, not only on the id. Under READ
    // COMMITTED a decline can commit between that read and this write; an
    // unguarded update would then write CONFIRMED over DECLINED and commit
    // a purchase order for an order the buyer was told is declined.
    // Throwing here rolls back the purchase order written just above.
    const { count } = await tx.webOrder.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        status: WebOrderStatus.CONFIRMED,
        purchaseOrderId: written,
        reviewedById: input.confirmedById,
        reviewedAt: new Date(),
      },
    });
    if (count === 0) throw new Error("ALREADY_REVIEWED");

    return { poId: written, order };
  });
}

/**
 * The buyer hears that their order is on. The file is redrawn first
 * (Phase 42), because the one sent at submit could not carry the date.
 */
export async function sendConfirmedEmail(input: {
  webOrderId: string;
  poId: string;
  reference: string;
  buyerReference: string | null;
  email: string;
  deliveryDate: string | null;
  total: string;
}) {
  const redrawn = await attachWebOrderDocument(input.webOrderId, { redraw: true });
  const po = await preparePoEmail(input.webOrderId, input.reference, redrawn);
  const expectedDelivery = input.deliveryDate ? formatDate(input.deliveryDate) : null;
  await sendEmail({
    to: [input.email],
    subject: webOrderConfirmedSubject(input.buyerReference, input.reference, expectedDelivery),
    attachments: po.attachments,
    react: WebOrderConfirmed({
      reference: input.reference,
      poNumber: input.buyerReference,
      expectedDelivery,
      total: formatMYR(Number(input.total)),
      orderUrl: `${env.SHOP_URL ?? env.APP_URL}/orders/${input.poId}`,
      attached: po.attached,
      document: po.document,
      buyerLogo: po.buyerLogo,
      preview: po.preview,
    }),
  });
}

/**
 * Confirm a just-sent shop order with no person in the loop, when every
 * product on it is green on NOT, HL and COA (ClickUp z8v9xnhuf7). Anything
 * else — one amber or red dot, no payment terms on the buyer — leaves it in
 * the review queue exactly as before.
 *
 * No delivery date is promised: nobody has committed to one. The team sets
 * it on the purchase order, which emails the buyer as a date change does.
 * Never throws: the order is already placed, and a failure here only means a
 * person reviews it.
 */
export async function autoApproveWebOrder(
  webOrderId: string,
  file: WebOrderDocument | null,
): Promise<boolean> {
  try {
    const order = await loadWebOrderForReview(webOrderId);
    if (!order || order.status !== WebOrderStatus.SUBMITTED || order.lines.length === 0) return false;
    const paymentTerms = paymentTermsDaysInput(order.buyerPaymentTerms);
    if (!paymentTerms) return false;
    const certs = await loadProductCerts(order.lines.map((line) => line.productId));
    const green = order.lines.every((line) => {
      const productCerts = certs.get(line.productId);
      return productCerts !== undefined && allGreen(productCerts);
    });
    if (!green) return false;

    // The draft the review form would have sent, untouched.
    const parsed = WebOrderDraftSchema.safeParse({
      poNumber: "",
      buyerId: order.buyerId,
      newBuyerName: null,
      poDate: todayISO(),
      currency: "MYR",
      paymentTerms,
      notes: null,
      lineItems: order.lines.map((line) => ({
        sku: line.sku,
        description: line.name,
        productId: line.productId,
        quantity: String(line.cartons),
        unit: line.unit,
        unitPrice: line.unitPrice,
        amount: line.amount,
        productDecision: "linked",
      })),
      subtotal: order.subtotal,
      tax: "0.00",
      total: order.subtotal,
    } satisfies PoDraft);
    if (!parsed.success) return false;
    const totals = checkTotals(parsed.data);
    if (!totals.matches) return false;

    const confirmed = await confirmWebOrderAs({
      webOrderId,
      data: parsed.data,
      totals,
      totalsAcknowledged: false,
      deliveryDate: null,
      confirmedById: null,
      documentId: file?.documentId ?? null,
    });
    await sendConfirmedEmail({
      webOrderId,
      poId: confirmed.poId,
      reference: confirmed.order.reference,
      buyerReference: confirmed.order.buyerReference,
      email: confirmed.order.placedBy.email,
      deliveryDate: null,
      total: parsed.data.total,
    });
    return true;
  } catch (cause) {
    console.error("[auto-approve]", webOrderId, cause);
    return false;
  }
}
