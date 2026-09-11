"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import {
  hashPassword,
  sendInviteEmail,
  temporaryPassword,
  uniqueMessage,
} from "@/lib/client-invites";
import { prisma } from "@/lib/prisma";
import { createCustomerSchema, type CreateCustomerInput } from "@/lib/validation/clients";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CreatedCustomer = {
  buyerId: string;
  /** "skipped" is a login handed over another way, or no login at all. */
  invite: "sent" | "failed" | "skipped";
};

/**
 * The front door a customer never had: before this, a `Buyer` existed only as a
 * side effect of confirming a purchase order (`writePurchaseOrder`) or of the
 * seed, so a customer meant to *start* on the shop could not be entered at all.
 *
 * Two writes in one transaction, then the email **after** it commits. A Resend
 * outage must not roll back a customer the reader has just typed in; a unique
 * clash must not leave half a customer behind.
 */
export async function createCustomer(
  input: CreateCustomerInput,
): Promise<ActionResult<CreatedCustomer>> {
  try {
    await requireSuperAdmin();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
    throw cause;
  }

  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That customer could not be created.",
    };
  }
  const { company, contact, sendInvite } = parsed.data;

  // Hashed before the transaction opens: bcrypt at cost 12 takes a few hundred
  // milliseconds, and spending that inside a transaction holds a Neon
  // connection open for no reason.
  const password = contact ? temporaryPassword() : null;
  const passwordHash = password ? await hashPassword(password) : null;

  let created: { buyerId: string; contact: { name: string; email: string } | null };
  try {
    created = await prisma.$transaction(async (tx) => {
      const buyer = await tx.buyer.create({ data: company, select: { id: true } });
      if (!contact || !passwordHash) return { buyerId: buyer.id, contact: null };
      const user = await tx.user.create({
        data: {
          name: contact.name,
          email: contact.email,
          username: contact.username,
          phone: contact.phone,
          role: Role.CLIENT,
          buyerId: buyer.id,
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: true,
        },
        select: { id: true, name: true, email: true },
      });
      return { buyerId: buyer.id, contact: { name: user.name, email: user.email } };
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return { success: false, error: uniqueMessage(cause.meta?.target) };
    }
    console.error("[customers] createCustomer", cause);
    return { success: false, error: "We couldn't create that customer." };
  }

  let invite: CreatedCustomer["invite"] = "skipped";
  if (created.contact && password && sendInvite) {
    invite = (await sendInviteEmail(created.contact, password)) ? "sent" : "failed";
  }

  revalidatePath("/buyers");
  return { success: true, data: { buyerId: created.buyerId, invite } };
}
