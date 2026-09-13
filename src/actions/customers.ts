"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { Role, WebOrderStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import {
  hashPassword,
  sendInviteEmail,
  temporaryPassword,
  uniqueMessage,
} from "@/lib/client-invites";
import { blockedMessage } from "@/lib/customer-delete-message";
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
  let admin;
  try {
    admin = await requireSuperAdmin();
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
      if (!contact || !passwordHash) {
        await audit(tx, {
          action: "CUSTOMER_CREATED",
          actorId: admin.id,
          buyerId: buyer.id,
          detail: { withContact: false, name: company.name },
        });
        return { buyerId: buyer.id, contact: null };
      }
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
      await audit(tx, {
        action: "CUSTOMER_CREATED",
        actorId: admin.id,
        buyerId: buyer.id,
        detail: { withContact: true, name: company.name },
      });
      return { buyerId: buyer.id, contact: { name: user.name, email: user.email } };
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return { success: false, error: uniqueMessage(cause.meta) };
    }
    console.error("[customers] createCustomer", cause);
    return { success: false, error: "We couldn't create that customer." };
  }

  let invite: CreatedCustomer["invite"] = "skipped";
  if (created.contact && password && sendInvite) {
    invite = (await sendInviteEmail(created.contact, password)) ? "sent" : "failed";
  }

  revalidatePath("/buyers");
  revalidatePath("/admin/customers");
  return { success: true, data: { buyerId: created.buyerId, invite } };
}

/**
 * A real delete, refused wherever an order points at the row.
 *
 * Postgres would refuse it anyway — `PurchaseOrder.buyerId` and
 * `WebOrder.buyerId` are required with no `onDelete`, so the database
 * restricts. The counts exist to turn that into a sentence naming what is in
 * the way, and to make the button honest before it is pressed.
 *
 * A cart is a `WebOrder` too — `openCart` creates one at DRAFT the moment a
 * signed-in client adds their first item, and Phase 17's guest-cart merge
 * does the same on sign-in — so the web-order count below excludes DRAFT,
 * the same filter `removeBuyerContact` applies for the identical reason.
 * Any draft that survives that filter is deleted here anyway, before the
 * contacts: its `placedById` points at one of this buyer's own contacts,
 * `WebOrder` has no `onDelete` on that relation, and deleting the contact
 * first would throw a foreign-key error. `WebOrderLine.webOrder` cascades
 * (`onDelete: Cascade` in the schema), so deleting the draft order is enough
 * to take its lines with it.
 */
export async function deleteBuyer(
  buyerId: string,
  confirmName: string,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireSuperAdmin();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
    throw cause;
  }

  try {
    const buyer = await prisma.buyer.findUnique({
      where: { id: buyerId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            purchaseOrders: true,
            webOrders: { where: { status: { not: WebOrderStatus.DRAFT } } },
            contacts: true,
          },
        },
      },
    });
    if (!buyer) return { success: false, error: "That customer is gone." };

    if (buyer.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) {
      return {
        success: false,
        error: "That name doesn't match. Type the customer's name exactly to delete them.",
      };
    }

    const { purchaseOrders, webOrders, contacts } = buyer._count;
    if (purchaseOrders > 0 || webOrders > 0) {
      return { success: false, error: blockedMessage(purchaseOrders, webOrders) };
    }

    await prisma.$transaction(async (tx) => {
      // First, and with `buyerId: null`: the foreign key is SET NULL, so an id
      // written here would be blanked by the delete a few lines below.
      await audit(tx, {
        action: "CUSTOMER_DELETED",
        actorId: admin.id,
        detail: { name: buyer.name, contacts },
      });
      // Before the contacts: a leftover draft order's placedById is one of them.
      await tx.webOrder.deleteMany({
        where: { buyerId: buyer.id, status: WebOrderStatus.DRAFT },
      });
      await tx.user.deleteMany({ where: { buyerId: buyer.id } });
      await tx.buyer.delete({ where: { id: buyer.id } });
    });

    revalidatePath("/buyers");
    revalidatePath("/admin/customers");
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2003") {
      return {
        success: false,
        error: "Something still references this customer, so it can't be deleted.",
      };
    }
    console.error("[customers] deleteBuyer", cause);
    return { success: false, error: "We couldn't delete that customer." };
  }
}
