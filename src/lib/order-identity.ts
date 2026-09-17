import type { Prisma } from "@/generated/prisma/client";

/**
 * A purchase order's two identifiers, which are never interchangeable
 * (2026-09-17).
 *
 * - **Order ID** — our internal tracking ID, `WebOrder.reference`
 *   (`W-2609-00014`). Only an order placed on the shop has one; an uploaded
 *   scan has none.
 * - **PO number** — the buyer's own purchase-order number. On a scan it is the
 *   number printed on the document (`PurchaseOrder.poNumber`); on a shop order
 *   it is the one the buyer typed at checkout (`buyerReference`), and blank
 *   when they typed none.
 *
 * Neither ever stands in for the other. Until this date confirming a shop
 * order copied its Order ID into `poNumber`, and every screen showed it as the
 * buyer's PO.
 */
export const ORDER_IDENTITY_SELECT = {
  poNumber: true,
  buyerReference: true,
  webOrder: { select: { reference: true } },
} satisfies Prisma.PurchaseOrderSelect;

export type OrderIdentitySource = {
  poNumber: string | null;
  buyerReference: string | null;
  webOrder: { reference: string } | null;
};

export type OrderIdentity = {
  orderId: string | null;
  poNumber: string | null;
};

export function orderIdentity(po: OrderIdentitySource): OrderIdentity {
  const fromShop = Boolean(po.webOrder);
  return {
    orderId: po.webOrder?.reference ?? null,
    // `buyerReference` counts only on a shop order. On a scan it is the
    // retired "buyer reference" extraction field (Phase 11), not a PO number.
    poNumber:
      po.poNumber?.trim() ||
      (fromShop ? po.buyerReference?.trim() || null : null),
  };
}

/**
 * One identifier, named, for the places that have room for a single one — a
 * tab title, an activity line, a "largest order" link: `Order ID W-2609-00014`,
 * or `PO number SVPPPO26090009` for a scan. Always prefixed with the same
 * words the columns use, so a reader can never take one for the other.
 */
export function orderLabel({ orderId, poNumber }: OrderIdentity): string {
  if (orderId) return `Order ID ${orderId}`;
  if (poNumber) return `PO number ${poNumber}`;
  return "Purchase order";
}
