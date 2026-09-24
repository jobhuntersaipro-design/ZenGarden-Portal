import { randomBytes } from "node:crypto";
import { Invitation, invitationSubject } from "@/emails/Invitation";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { hashToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

/**
 * An invitation's set-password link lasts a week, where a reset link lasts 30
 * minutes: a reset is asked for by the person about to use it, an invitation
 * is read whenever they next open their inbox.
 */
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60_000;

/**
 * Issues a one-time set-password link and emails it. Rides on the reset-token
 * table, so the link lands on the same `/reset-password/[token]` page and
 * `resetPassword` writes the first password exactly as it writes a new one.
 *
 * Awaits the send and returns whether it went, so the admin is never told an
 * invitation was sent when it was not (the Phase 23 defect).
 */
export async function sendInvitation(user: {
  id: string;
  name: string;
  email: string;
}): Promise<boolean> {
  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
    },
  });
  const { sent } = await sendEmail({
    to: user.email,
    subject: invitationSubject(),
    react: Invitation({
      name: user.name,
      setPasswordUrl: `${env.APP_URL}/reset-password/${token}`,
      signInUrl: `${env.APP_URL}/signin`,
    }),
  });
  return sent;
}
