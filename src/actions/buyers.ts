"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { audit, changedFields } from "@/lib/audit";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const emptyToNull = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value?.trim() || null));

const buyerPatchSchema = z.object({
  /** Super admins only; the action checks the role before it applies. */
  name: z.string().min(1, "A buyer needs a name").optional(),
  contactName: emptyToNull,
  email: emptyToNull,
  phone: emptyToNull,
  address: emptyToNull,
  paymentTerms: emptyToNull,
  remark: emptyToNull,
});

export type BuyerPatch = z.input<typeof buyerPatchSchema>;

/**
 * Renaming a buyer is super-admin only: the name is the unique key every PO
 * matched against during review, so changing it rewrites how past records read.
 */
export async function updateBuyer(
  buyerId: string,
  patch: BuyerPatch,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch (cause) {
    return {
      success: false,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }

  const parsed = buyerPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those changes could not be saved.",
    };
  }
  const { name, ...rest } = parsed.data;

  if (name !== undefined && user.role !== Role.SUPER_ADMIN) {
    return { success: false, error: "Only a super admin can rename a buyer." };
  }

  try {
    const current = await prisma.buyer.findUnique({
      where: { id: buyerId },
      select: {
        name: true,
        contactName: true,
        email: true,
        phone: true,
        address: true,
        paymentTerms: true,
        remark: true,
      },
    });
    if (!current) return { success: false, error: "That buyer is gone." };

    const data = { ...rest, ...(name !== undefined ? { name } : {}) };
    const fields = changedFields(data, current);

    await prisma.$transaction(async (tx) => {
      await tx.buyer.update({ where: { id: buyerId }, data });
      // A save that changed nothing is not an edit. Recording it would fill
      // the timeline with "edited" entries naming no field.
      if (fields.length > 0) {
        await audit(tx, {
          action: "CUSTOMER_UPDATED",
          actorId: user.id,
          buyerId,
          detail: { fields },
        });
      }
    });

    revalidatePath(`/buyers/${buyerId}`);
    revalidatePath("/buyers");
    revalidatePath("/admin/buyers");
    revalidatePath(`/admin/buyers/${buyerId}`);
    return { success: true, data: undefined };
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return { success: false, error: "Another buyer already has that name." };
    }
    console.error("[buyers] updateBuyer", cause);
    return { success: false, error: "We couldn't save those changes." };
  }
}
