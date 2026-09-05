"use server";

import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { compare, hash } from "bcryptjs";
import { PasswordReset, passwordResetSubject } from "@/emails/PasswordReset";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { signIn } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { checkPasswordResetAllowed } from "@/lib/rate-limit";
import { RESET_TOKEN_TTL_MS, hashToken } from "@/lib/password-reset";
import {
  changePasswordSchema,
  emailSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

/** Cost 12 everywhere a password is written (docs/specs/02-auth.md §4). */
const BCRYPT_COST = 12;

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * The answer is the same whether the address exists, has no password, or has
 * asked three times already. Anything else turns this form into a directory of
 * who works here.
 */
export async function requestPasswordReset(
  email: string,
): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { success: false, error: "Enter a valid email address." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data },
      select: { id: true, name: true, email: true, passwordHash: true, disabledAt: true },
    });

    if (user && user.passwordHash && !user.disabledAt) {
      if (await checkPasswordResetAllowed(user.id)) {
        const token = randomBytes(32).toString("base64url");
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        });
        // Sent after the response, not inside it. Awaiting a Resend round-trip
        // here made the "this address has a password" branch hundreds of
        // milliseconds slower than the "nothing to do" branch, which handed
        // back by timing exactly what the identical copy is there to withhold.
        const { email: to, name } = user;
        after(() =>
          sendEmail({
            to,
            subject: passwordResetSubject(),
            react: PasswordReset({
              name,
              resetUrl: `${env.APP_URL}/reset-password/${token}`,
            }),
          }),
        );
      }
    }

    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[auth] requestPasswordReset", cause);
    // Still the same answer: an outage must not become an oracle either.
    return { success: true, data: undefined };
  }
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({ token, password });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That password will not do.",
    };
  }

  try {
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!row || row.usedAt || row.expiresAt <= new Date()) {
      return {
        success: false,
        error: "This link has expired. Request a new one.",
      };
    }

    const passwordHash = await hash(parsed.data.password, BCRYPT_COST);

    const consumed = await prisma.$transaction(async (tx) => {
      // Claiming the token is what decides the race: two requests arriving
      // together both read it as unused, but only one `updateMany` matches
      // `usedAt: null`, and the loser changes nothing.
      const claim = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claim.count === 0) return false;

      await tx.user.update({
        where: { id: row.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          // Whoever was signed in on the old password is signed out.
          sessionVersion: { increment: 1 },
        },
      });
      await tx.passwordResetToken.deleteMany({
        where: { userId: row.userId, id: { not: row.id } },
      });
      return true;
    });

    if (!consumed) {
      return {
        success: false,
        error: "This link has expired. Request a new one.",
      };
    }

    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[auth] resetPassword", cause);
    return { success: false, error: "We could not set that password." };
  }
}

/**
 * `reauthenticated: false` means the password is changed but this browser's
 * session did not survive, so the caller has to send the user to /signin.
 */
export async function changePassword(input: {
  currentPassword?: string;
  password: string;
}): Promise<ActionResult<{ reauthenticated: boolean }>> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That password will not do.",
    };
  }

  try {
    const session = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { email: true, passwordHash: true, mustChangePassword: true },
    });
    if (!user) throw new UnauthorizedError();

    // The forced case is an admin-set password the user has never chosen, so
    // there is nothing to recall. Every other case proves the old one first.
    if (!user.mustChangePassword) {
      if (!parsed.data.currentPassword) {
        return { success: false, error: "Enter your current password." };
      }
      const ok =
        Boolean(user.passwordHash) &&
        (await compare(parsed.data.currentPassword, user.passwordHash!));
      if (!ok) {
        return { success: false, error: "That is not your current password." };
      }
    }

    const passwordHash = await hash(parsed.data.password, BCRYPT_COST);
    await prisma.user.update({
      where: { id: session.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        // Signs out every other browser. This one is re-minted below, which is
        // what lets the flag clear without sending the user back to /signin.
        sessionVersion: { increment: 1 },
      },
    });

    try {
      await signIn("credentials", {
        email: user.email,
        password: parsed.data.password,
        redirect: false,
      });
      return { success: true, data: { reauthenticated: true } };
    } catch (cause) {
      console.error("[auth] could not re-mint the session after a change", cause);
      return { success: true, data: { reauthenticated: false } };
    }
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    console.error("[auth] changePassword", cause);
    return { success: false, error: "We could not change your password." };
  }
}
