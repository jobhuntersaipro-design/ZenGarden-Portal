/**
 * The delete-blocked sentence, alone, with no `prisma` or `"use server"`
 * import.
 *
 * `deleteBuyer` (`src/actions/customers.ts`) computes this to decide whether
 * a delete is refused; `DeleteCustomer` (`src/components/admin/DeleteCustomer.tsx`)
 * needs the identical sentence to show *before* the button is pressed, so the
 * reader is never told something different from what the server would say
 * about the same customer. `customers.ts` is `"use server"`, which can only
 * export async functions — this is exactly why the shared sentence lives
 * here instead, the same shape as `admin-customer-labels.ts` and
 * `customer-activity-entries.ts`. Both sides import this one function; there
 * is no second copy to drift.
 */
export function blockedMessage(purchaseOrders: number, webOrders: number): string {
  const parts: string[] = [];
  if (purchaseOrders > 0) {
    parts.push(`${purchaseOrders} purchase order${purchaseOrders === 1 ? "" : "s"}`);
  }
  if (webOrders > 0) {
    parts.push(`${webOrders} shop order${webOrders === 1 ? "" : "s"}`);
  }
  const subject = parts.join(" and ");
  const verb = purchaseOrders + webOrders === 1 ? "references" : "reference";
  return `${subject} ${verb} this customer, so it can't be deleted. Disable their shop contacts instead.`;
}
