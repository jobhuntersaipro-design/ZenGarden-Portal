/**
 * The delete-blocked sentence, alone, with no `prisma` or `"use server"`
 * import — the shape `buyer-delete-message.ts` established and for the same
 * reason.
 *
 * `deleteProduct` computes it to decide whether a delete is refused, and
 * `DeleteProduct` shows it *before* the button is pressed, so a reader is
 * never told something different from what the server would say about the
 * same product. One function, both sides; no second copy to drift.
 */
export function productBlockedMessage(
  purchaseOrderLines: number,
  shopOrderLines: number,
): string {
  const parts: string[] = [];
  if (purchaseOrderLines > 0) {
    parts.push(
      `${purchaseOrderLines} purchase-order line${purchaseOrderLines === 1 ? "" : "s"}`,
    );
  }
  if (shopOrderLines > 0) {
    parts.push(`${shopOrderLines} shop-order line${shopOrderLines === 1 ? "" : "s"}`);
  }
  const subject = parts.join(" and ");
  const verb = purchaseOrderLines + shopOrderLines === 1 ? "references" : "reference";
  return `${subject} ${verb} this product, so it can't be deleted. Unpublish it instead.`;
}
