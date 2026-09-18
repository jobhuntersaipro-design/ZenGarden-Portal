"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { PasswordReset, passwordResetSubject } from "@/emails/PasswordReset";
import { audit } from "@/lib/audit";
import { UnauthorizedError } from "@/lib/auth-guards";
import { requirePermission } from "@/lib/permissions/require";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { RESET_TOKEN_TTL_MS, hashToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const idSchema = z.string().min(1);

/**
 * Where the link lands. A client signs in on the shop host, and the reset
 * page is served at the same path on both hosts — so the host decides which
 * sign-in they reach afterwards, not the page. Staff get the portal.
 */
const resetLinkBase = (role: Role): string =>
  role === Role.CLIENT ? (env.SHOP_URL ?? env.APP_URL) : env.APP_URL;

/**
 * A super admin puts a one-time reset link in someone's inbox — a member's
 * or a buyer contact's (docs/specs/26-buyer-management.md §2).
 *
 * The same token mechanics as the public forgot-password form
 * (`requestPasswordReset`, `src/actions/auth.ts`), with two deliberate
 * differences. The public form answers identically whatever the address is,
 * because it must not become a directory of who works here; this one is
 * called by a super admin who is looking at the row, so it says plainly why
 * a link cannot go. And the public form sends after the response so its
 * timing reveals nothing; this one **awaits** the send so the toast can say
 * whether the email went — telling someone to check an inbox that stays
 * empty is the defect Phase 23 found in exactly this kind of flow.
 *
 * The audit row is written with the token, before the send: the trail
 * records that a link was issued, which is true whether or not Resend
 * delivered it.
 */
export async function sendPasswordResetLink(
  userId: string,
): Promise<ActionResult<{ sent: boolean; email: string }>> {
  let admin;
  try {
    admin = await requirePermission("user.manage");
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
    throw cause;
  }
  if (!idSchema.safeParse(userId).success) {
    return { success: false, error: "That account is gone." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        buyerId: true,
        passwordHash: true,
        disabledAt: true,
      },
    });
    if (!user) return { success: false, error: "That account is gone." };
    if (!user.passwordHash) {
      return {
        success: false,
        error: "They sign in with Google, so there is no password to reset.",
      };
    }
    if (user.disabledAt) {
      return { success: false, error: "Restore their access first." };
    }

    const token = randomBytes(32).toString("base64url");
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      await audit(tx, {
        action: "RESET_LINK_SENT",
        actorId: admin.id,
        buyerId: user.buyerId,
        subjectUserId: user.id,
        detail: { name: user.name },
      });
    });

    const { sent } = await sendEmail({
      to: user.email,
      subject: passwordResetSubject(),
      react: PasswordReset({
        name: user.name,
        resetUrl: `${resetLinkBase(user.role)}/reset-password/${token}`,
      }),
    });

    if (user.buyerId) {
      revalidatePath(`/buyers/${user.buyerId}`);
      revalidatePath(`/admin/buyers/${user.buyerId}`);
    }
    return { success: true, data: { sent, email: user.email } };
  } catch (cause) {
    console.error("[reset-links] sendPasswordResetLink", cause);
    return { success: false, error: "We couldn't send that link." };
  }
}
