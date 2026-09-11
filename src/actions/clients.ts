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
import {
  contactPatchSchema,
  inviteContactSchema,
  type ContactPatch,
  type InviteContactInput,
} from "@/lib/validation/clients";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

async function guard() {
  try {
    return { user: await requireSuperAdmin() };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { error: cause.message };
    throw cause;
  }
}

/**
 * Invite one of a buyer's own staff to the shop.
 *
 * A thin wrapper over the same creation path an ops user goes through, not a
 * fork of it: the row is a `User`, so bcrypt, `mustChangePassword`,
 * `sessionVersion` and the whole password-reset flow come along unchanged. The
 * two things that differ are the role and the buyer, and neither is the
 * caller's to choose — the role is always CLIENT and the buyer is the page the
 * invite was sent from.
 */
export async function inviteBuyerContact(
  input: InviteContactInput,
): Promise<ActionResult<{ id: string }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = inviteContactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That contact could not be invited.",
    };
  }
  const data = parsed.data;

  try {
    const buyer = await prisma.buyer.findUnique({
      where: { id: data.buyerId },
      select: { id: true },
    });
    if (!buyer) return { success: false, error: "That buyer is gone." };

    const password = temporaryPassword();
    const created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        username: data.username,
        phone: data.phone,
        role: Role.CLIENT,
        buyerId: buyer.id,
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
        mustChangePassword: true,
      },
      select: { id: true, name: true, email: true },
    });

    await sendInviteEmail(created, password);

    revalidatePath(`/buyers/${buyer.id}`);
    return { success: true, data: { id: created.id } };
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return { success: false, error: uniqueMessage(cause.meta?.target) };
    }
    console.error("[clients] inviteBuyerContact", cause);
    return { success: false, error: "We couldn't invite that contact." };
  }
}

/** A fresh temporary password, for an invite that was lost or expired. */
export async function resendClientInvite(
  contactId: string,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const contact = await prisma.user.findUnique({
      where: { id: contactId },
      select: { id: true, name: true, email: true, role: true, buyerId: true },
    });
    if (!contact || contact.role !== Role.CLIENT) {
      return { success: false, error: "That contact is gone." };
    }

    const password = temporaryPassword();
    await prisma.user.update({
      where: { id: contact.id },
      data: {
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
        mustChangePassword: true,
        // Ends every live session for this contact, so an invite that is
        // being resent because it went astray cannot leave one open.
        sessionVersion: { increment: 1 },
      },
    });

    await sendInviteEmail(contact, password);

    if (contact.buyerId) revalidatePath(`/buyers/${contact.buyerId}`);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[clients] resendClientInvite", cause);
    return { success: false, error: "We couldn't resend that invite." };
  }
}

/** Revoke a contact's access. The row stays, so their orders stay attributed. */
export async function setClientAccess(
  contactId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const contact = await prisma.user.findUnique({
      where: { id: contactId },
      select: { id: true, role: true, buyerId: true },
    });
    if (!contact || contact.role !== Role.CLIENT) {
      return { success: false, error: "That contact is gone." };
    }

    await prisma.user.update({
      where: { id: contact.id },
      data: {
        disabledAt: enabled ? null : new Date(),
        // The jwt callback reads this, so revoking takes effect within the
        // refresh interval rather than whenever their cookie expires.
        ...(enabled ? {} : { sessionVersion: { increment: 1 } }),
      },
    });

    if (contact.buyerId) revalidatePath(`/buyers/${contact.buyerId}`);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[clients] setClientAccess", cause);
    return { success: false, error: "We couldn't change that contact's access." };
  }
}

/**
 * Name, username and phone. Deliberately not the email: that is how the
 * account is identified, and changing it is a different, riskier operation.
 */
export async function updateBuyerContact(
  contactId: string,
  patch: ContactPatch,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = contactPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those changes could not be saved.",
    };
  }

  try {
    const contact = await prisma.user.findUnique({
      where: { id: contactId },
      select: { id: true, role: true, buyerId: true },
    });
    if (!contact || contact.role !== Role.CLIENT) {
      return { success: false, error: "That contact is gone." };
    }

    await prisma.user.update({ where: { id: contact.id }, data: parsed.data });
    if (contact.buyerId) revalidatePath(`/buyers/${contact.buyerId}`);
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return { success: false, error: uniqueMessage(cause.meta?.target) };
    }
    console.error("[clients] updateBuyerContact", cause);
    return { success: false, error: "We couldn't save those changes." };
  }
}
