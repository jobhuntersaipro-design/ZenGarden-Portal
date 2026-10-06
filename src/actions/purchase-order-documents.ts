"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UnauthorizedError } from "@/lib/auth-guards";
import { requirePermission } from "@/lib/permissions/require";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const idSchema = z.string().min(1).max(64);

async function manage() {
  try {
    const user = await requirePermission("po.view");
    await requirePermission("po.document");
    return { error: null, user };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { error: cause.message, user: null };
    throw cause;
  }
}

/**
 * Removes one file from one order. The pair of ids is the whole scope: a
 * document that belongs to a different order is left where it is.
 */
export async function deletePurchaseOrderDocument(input: {
  id: string;
  purchaseOrderId: string;
}): Promise<ActionResult> {
  const { error } = await manage();
  if (error) return { success: false, error };
  const id = idSchema.safeParse(input.id);
  const purchaseOrderId = idSchema.safeParse(input.purchaseOrderId);
  if (!id.success || !purchaseOrderId.success) {
    return { success: false, error: "That file is gone." };
  }

  try {
    const document = await prisma.purchaseOrderDocument.findFirst({
      where: { id: id.data, purchaseOrderId: purchaseOrderId.data },
      select: { r2Key: true, purchaseOrderId: true },
    });
    if (!document) return { success: false, error: "That file is gone." };
    await prisma.purchaseOrderDocument.delete({ where: { id: id.data } });
    await deleteObject(document.r2Key).catch((cause) =>
      console.error("[po-documents] could not delete the object", cause),
    );
    revalidatePath(`/purchase-orders/${document.purchaseOrderId}`);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[po-documents] delete", cause);
    return { success: false, error: "We couldn't delete that file." };
  }
}
