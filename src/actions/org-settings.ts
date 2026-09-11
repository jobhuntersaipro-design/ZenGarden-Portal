"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { shopPath } from "@/lib/shop-routes";
import { supplierPatchSchema, type SupplierPatch } from "@/lib/validation/org-settings";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * The supplier contact details the public shop displays. Super admin only —
 * the `(admin)` shell already refuses everyone else, and this refuses them
 * again, because a route guard is not an authorisation model.
 */
export async function updateSupplierDetails(
  patch: SupplierPatch,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireSuperAdmin();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
    throw cause;
  }

  const parsed = supplierPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those changes could not be saved.",
    };
  }

  try {
    await prisma.orgSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...parsed.data, updatedById: user.id },
      update: { ...parsed.data, updatedById: user.id },
    });

    revalidatePath("/admin");
    // The real paths, not the browser-relative ones: revalidation keys on the
    // resolved route (src/lib/shop-routes.ts).
    revalidatePath(shopPath.home());
    revalidatePath(shopPath.catalogue());
    revalidatePath(shopPath.cart());
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[org-settings] updateSupplierDetails", cause);
    return { success: false, error: "We couldn't save those details." };
  }
}
