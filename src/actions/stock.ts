"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedError } from "@/lib/auth-guards";
import { requirePermission } from "@/lib/permissions/require";
import { movementCutoff, onHandAfterDeliveries } from "@/lib/delivery-stock";
import { prisma } from "@/lib/prisma";
import { lockProductsInIdOrder } from "@/lib/product-lock";
import {
  saveStockCountsSchema,
  type SaveStockCountsInput,
} from "@/lib/validation/stock";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Counting stock (Phase 55). The stocktake sheet and a single product's form
 * both call this, so a row cannot differ by where it was typed.
 *
 * Stock is a catalogue figure, so it rides on `product.manage` rather than a
 * permission of its own — a new key would be unseeded until somebody saved the
 * grid, and counting is the same job as keeping the catalogue true.
 */
const guard = async () => {
  try {
    return { user: await requirePermission("product.manage"), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }
};

export async function saveStockCounts(
  input: SaveStockCountsInput,
): Promise<ActionResult<{ saved: number; corrected: number }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = saveStockCountsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { countedOn, note, entries } = parsed.data;
  // `@db.Date` truncates in UTC, so the day has to be built there or a count
  // entered in Kuala Lumpur lands on the day before.
  const day = new Date(`${countedOn}T00:00:00.000Z`);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Same id order as the delivery deduction, and held until this
      // transaction commits, so a delivery cannot land between the movement
      // read below and the cache write.
      await lockProductsInIdOrder(
        tx,
        entries.map((entry) => entry.productId),
      );

      // Read inside the transaction: two people counting the same product at
      // once must not both write a row that supersedes nothing.
      const existing = await tx.stockCount.findMany({
        where: {
          productId: { in: entries.map((entry) => entry.productId) },
          countedOn: day,
          supersededBy: { is: null },
        },
        select: { id: true, productId: true },
      });
      const current = new Map(existing.map((row) => [row.productId, row.id]));

      let corrected = 0;
      for (const entry of entries) {
        const supersedesId = current.get(entry.productId) ?? null;
        if (supersedesId) corrected += 1;
        await tx.stockCount.create({
          data: {
            productId: entry.productId,
            countedOn: day,
            cartons: entry.cartons,
            note,
            countedById: user.id,
            supersedesId,
          },
        });
      }

      // Rewrite the cache on `Product`, per product, from the ledger itself
      // rather than from what was just typed: correcting a past day must not
      // move the current figure (spec §6, criterion 4). Deliveries after the
      // count's cutoff stay deducted. Using the new row's own `createdAt`
      // would put them back when somebody corrects that day, or types a
      // backdated count, after the cartons have already left.
      for (const entry of entries) {
        const latest = await tx.stockCount.findFirst({
          where: { productId: entry.productId, supersededBy: { is: null } },
          orderBy: [{ countedOn: "desc" }, { createdAt: "desc" }],
          select: { cartons: true, createdAt: true, countedOn: true },
        });
        const earliest = latest
          ? await tx.stockCount.findFirst({
              where: { productId: entry.productId, countedOn: latest.countedOn },
              orderBy: { createdAt: "asc" },
              select: { createdAt: true },
            })
          : null;
        const delivered = latest
          ? await tx.stockMovement.aggregate({
              where: {
                productId: entry.productId,
                createdAt: {
                  gt: movementCutoff(
                    latest.countedOn,
                    earliest?.createdAt ?? latest.createdAt,
                  ),
                },
              },
              _sum: { quantity: true },
            })
          : null;
        await tx.product.update({
          where: { id: entry.productId },
          data: {
            stockCartons:
              latest === null
                ? null
                : onHandAfterDeliveries(latest.cartons, delivered?._sum.quantity ?? 0),
          },
        });
      }

      return { saved: entries.length, corrected };
    });

    for (const path of ["/stock", "/products", "/demand"]) revalidatePath(path);
    for (const entry of entries) revalidatePath(`/products/${entry.productId}`);
    return { success: true, data: result };
  } catch (cause) {
    console.error("saveStockCounts failed", cause);
    return { success: false, error: "Those counts could not be saved." };
  }
}
