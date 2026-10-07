import type { Prisma } from "@/generated/prisma/client";

/**
 * Locks product rows in id order. Delivery and the stocktake both take this
 * lock, so they have to take it in the same order or two transactions that
 * touch the same products can deadlock. The delivery path locks the purchase
 * order first, then these rows; the stocktake locks only these rows.
 */
export async function lockProductsInIdOrder(
  tx: Prisma.TransactionClient,
  productIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(productIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`
    SELECT "id" FROM "Product"
    WHERE "id" = ANY(${ids})
    ORDER BY "id"
    FOR UPDATE
  `;
}
