import { Prisma } from "@/generated/prisma/client";
import { PoStage } from "@/generated/prisma/enums";
import {
  OUT_FOR_DELIVERY_REASON,
  planDeliveryDeduction,
  type DeliveryLine,
} from "@/lib/delivery-stock";

/**
 * Raised after a compare-and-set loses, so the surrounding transaction rolls
 * the marker and any earlier product write back. The reader is told to
 * refresh; the stage has not moved.
 */
export class StockChangedError extends Error {
  constructor() {
    super("Stock changed while this order was moving. Refresh and try again.");
    this.name = "StockChangedError";
  }
}

export type DeliveryDeduction =
  | { status: "deducted"; productIds: string[] }
  | { status: "already" }
  | { status: "race" }
  | { status: "missing" }
  | { status: "short"; error: string };

type OrderRow = {
  id: string;
  poNumber: string | null;
  stage: PoStage;
  stockDeductedAt: Date | null;
  lineItems: {
    id: string;
    position: number;
    description: string;
    quantity: Prisma.Decimal;
    productId: string | null;
    product: { id: string; name: string; variant: string | null } | null;
  }[];
};

/**
 * Deducts stock for the move into Delivering, or reports that it already
 * happened. Writes nothing when the order is short: the caller keeps the
 * stage where it is.
 *
 * The claim (`stockDeductedAt` still null) is one conditional update, so two
 * concurrent moves cannot both pass it. Product writes then compare-and-set
 * the on-hand figure that was just read, so a second order shipping the same
 * product cannot apply a stale total. Both sit in the caller's transaction
 * with the stage change; a lost race throws and that transaction rolls back.
 */
export async function applyOutForDeliveryDeduction(
  tx: Prisma.TransactionClient,
  input: { poId: string; expectedStage: PoStage; actorId: string },
): Promise<DeliveryDeduction> {
  await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${input.poId} FOR UPDATE`;

  const order = await tx.purchaseOrder.findUnique({
    where: { id: input.poId },
    select: {
      id: true,
      poNumber: true,
      stage: true,
      stockDeductedAt: true,
      lineItems: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          description: true,
          quantity: true,
          productId: true,
          product: { select: { id: true, name: true, variant: true } },
        },
      },
    },
  });
  if (!order) return { status: "missing" };
  if (order.stage !== input.expectedStage) return { status: "race" };
  if (order.stockDeductedAt) return { status: "already" };

  const productIds = [
    ...new Set(
      order.lineItems
        .map((line) => line.productId)
        .filter((id): id is string => id !== null),
    ),
  ].sort();

  if (productIds.length > 0) {
    await tx.$queryRaw`
      SELECT "id" FROM "Product"
      WHERE "id" IN (${Prisma.join(productIds)})
      ORDER BY "id"
      FOR UPDATE
    `;
  }

  const stock = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, variant: true, stockCartons: true },
  });

  const plan = planDeliveryDeduction(toLines(order), stock);
  if (!plan.ok) return { status: "short", error: plan.error };

  // Claim before the shelf moves. The loser of two concurrent moves matches
  // no row and leaves the winner's transaction to finish the stage change.
  const claim = await tx.purchaseOrder.updateMany({
    where: {
      id: input.poId,
      stage: input.expectedStage,
      stockDeductedAt: null,
    },
    data: { stockDeductedAt: new Date() },
  });
  if (claim.count === 0) return { status: "race" };

  for (const product of plan.products) {
    const wrote = await tx.product.updateMany({
      where: { id: product.productId, stockCartons: product.beforeCartons },
      data: { stockCartons: product.afterCartons },
    });
    if (wrote.count === 0) throw new StockChangedError();
  }

  if (plan.movements.length > 0) {
    await tx.stockMovement.createMany({
      data: plan.movements.map((movement) => ({
        productId: movement.productId,
        purchaseOrderId: order.id,
        lineItemId: movement.lineItemId,
        quantity: movement.quantity,
        beforeCartons: movement.beforeCartons,
        afterCartons: movement.afterCartons,
        poNumber: order.poNumber,
        reason: OUT_FOR_DELIVERY_REASON,
        actorId: input.actorId,
      })),
    });
  }

  return {
    status: "deducted",
    productIds: plan.products.map((product) => product.productId),
  };
}

function toLines(order: OrderRow): DeliveryLine[] {
  return order.lineItems.map((line) => ({
    id: line.id,
    position: line.position,
    description: line.description,
    quantity: line.quantity.toString(),
    productId: line.productId,
    productName: line.product?.name ?? null,
    variant: line.product?.variant ?? null,
  }));
}
