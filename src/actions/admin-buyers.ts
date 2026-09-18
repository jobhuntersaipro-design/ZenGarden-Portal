"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { Role, WebOrderStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { UnauthorizedError } from "@/lib/auth-guards";
import { requirePermission } from "@/lib/permissions/require";
import {
  hashPassword,
  sendInviteEmail,
  temporaryPassword,
  uniqueMessage,
} from "@/lib/client-invites";
import { blockedMessage } from "@/lib/buyer-delete-message";
import { prisma } from "@/lib/prisma";
import { usernameBase, usernameFromEmail } from "@/lib/username";
import { createBuyerSchema, type CreateBuyerInput } from "@/lib/validation/clients";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Every id these actions take is a real row's cuid — never empty, never absent. */
const idSchema = z.string().min(1);

export type CreatedBuyer = {
  buyerId: string;
  /** Whether the contact's invitation actually left. The rows exist either way. */
  invite: "sent" | "failed";
};

/**
 * The front door a buyer never had: before Phase 23, a `Buyer` existed only as
 * a side effect of confirming a purchase order (`writePurchaseOrder`) or of
 * the seed, so a buyer meant to *start* on the shop could not be entered at
 * all.
 *
 * Phase 26 made the point of contact the shop login, always
 * (docs/specs/26-buyer-management.md §3): one company, one person, one
 * invitation. Two writes in one transaction, then the email **after** it
 * commits. A Resend outage must not roll back a buyer the reader has just
 * typed in; a unique clash must not leave half a buyer behind.
 */
export async function createBuyer(
  input: CreateBuyerInput,
): Promise<ActionResult<CreatedBuyer>> {
  let admin;
  try {
    admin = await requirePermission("buyer.manage");
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
    throw cause;
  }

  const parsed = createBuyerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That buyer could not be created.",
    };
  }
  const { name, contact, address, paymentTerms, remark } = parsed.data;

  // Hashed before the transaction opens: bcrypt at cost 12 takes a few hundred
  // milliseconds, and spending that inside a transaction holds a Neon
  // connection open for no reason.
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  let created: { buyerId: string; contact: { name: string; email: string } };
  try {
    created = await prisma.$transaction(async (tx) => {
      const buyer = await tx.buyer.create({
        data: {
          name,
          address,
          paymentTerms,
          remark,
          // The point of contact is the company's contact too: on a
          // one-person account they are the same human, and the buyer
          // details card should not read blank beside a contacts card that
          // names them.
          contactName: contact.name,
          email: contact.email,
          phone: contact.phone,
        },
        select: { id: true },
      });
      // Derived, not asked for. Read inside the transaction so two admins
      // creating "siti@…" contacts at once cannot both be handed "siti" —
      // the unique index would still refuse the loser, and `uniqueMessage`
      // would then blame a handle nobody typed.
      const base = usernameBase(contact.email);
      const taken = await tx.user.findMany({
        where: { username: { startsWith: base } },
        select: { username: true },
      });
      const username = usernameFromEmail(
        contact.email,
        taken.map((row) => row.username).filter((value): value is string => value !== null),
      );
      const user = await tx.user.create({
        data: {
          name: contact.name,
          email: contact.email,
          username,
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
        subjectUserId: user.id,
        detail: { withContact: true, name },
      });
      return { buyerId: buyer.id, contact: { name: user.name, email: user.email } };
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return { success: false, error: uniqueMessage(cause.meta) };
    }
    console.error("[admin-buyers] createBuyer", cause);
    return { success: false, error: "We couldn't create that buyer." };
  }

  const invite: CreatedBuyer["invite"] = (await sendInviteEmail(created.contact, password))
    ? "sent"
    : "failed";

  revalidatePath("/buyers");
  revalidatePath("/admin/buyers");
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
    admin = await requirePermission("buyer.manage");
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
    throw cause;
  }
  if (!idSchema.safeParse(buyerId).success) {
    return { success: false, error: "That buyer is gone." };
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
    if (!buyer) return { success: false, error: "That buyer is gone." };

    if (buyer.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) {
      return {
        success: false,
        error: "That name doesn't match. Type the buyer's name exactly to delete it.",
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
      // role: CLIENT, not buyerId alone: the CHECK constraint enforces
      // CLIENT ⇒ buyerId, not the converse, so nothing in the schema stops a
      // MEMBER row from carrying a buyerId. Nothing sets one today, but an
      // unfiltered deleteMany would hard-delete an ops account from the
      // buyers screen if one ever did — the one thing this room's
      // authorization rule says must never happen.
      await tx.user.deleteMany({ where: { buyerId: buyer.id, role: Role.CLIENT } });
      await tx.buyer.delete({ where: { id: buyer.id } });
    });

    revalidatePath("/buyers");
    revalidatePath("/admin/buyers");
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2003") {
      return {
        success: false,
        error: "Something still references this buyer, so it can't be deleted.",
      };
    }
    console.error("[admin-buyers] deleteBuyer", cause);
    return { success: false, error: "We couldn't delete that buyer." };
  }
}
