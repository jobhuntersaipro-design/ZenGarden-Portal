import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { TemporaryPassword, temporaryPasswordSubject } from "@/emails/TemporaryPassword";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

const BCRYPT_COST = 12;

/**
 * A temporary password the reader never chooses. 18 base64url characters is
 * well past the 10-character floor `passwordSchema` sets, and it is shown once
 * in the email and never stored in the clear.
 */
export const temporaryPassword = () => randomBytes(14).toString("base64url");

export const hashPassword = (plain: string) => hash(plain, BCRYPT_COST);

/**
 * Where a client signs in. Falls back to the portal only so a deployment with
 * no shop host configured still sends a working link — on such a deployment
 * the proxy serves everything from one host anyway.
 */
export const clientSignInUrl = () => `${env.SHOP_URL ?? env.APP_URL}/signin`;

/**
 * Returns whether it went out rather than throwing. The customer is already
 * committed by the time this runs (docs/specs/23-customer-profiles.md §4), and
 * a Resend outage must not read as a failed creation.
 */
export async function sendInviteEmail(
  contact: { name: string; email: string },
  password: string,
): Promise<boolean> {
  try {
    await sendEmail({
      to: contact.email,
      subject: temporaryPasswordSubject(),
      react: TemporaryPassword({
        name: contact.name,
        password,
        // The shop, never the portal: a client sent to the portal is
        // redirected straight back out of it.
        signInUrl: clientSignInUrl(),
      }),
    });
    return true;
  } catch (cause) {
    console.error("[client-invites] sendInviteEmail", cause);
    return false;
  }
}

/**
 * Which unique constraint a P2002 hit. Prisma reports `meta.target` as either
 * the field names or the constraint name depending on the connector, so this
 * matches on the text of both.
 *
 * **The order is load-bearing.** "username" contains "name", and
 * `User_username_key` contains both "name" and "username" — checking `name`
 * first would label every duplicate handle a duplicate company.
 */
export function uniqueMessage(target: unknown): string {
  const text = (Array.isArray(target) ? target.join(",") : String(target ?? "")).toLowerCase();
  if (text.includes("username")) return "That username is taken.";
  if (text.includes("email")) return "That email address is already in use.";
  if (text.includes("name")) return "Another customer already has that name.";
  return "Something about that customer is already in use.";
}
