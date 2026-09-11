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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

/** An array of field names joined, or a bare string, or "" for anything else. */
const fieldText = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").join(",");
  }
  return typeof value === "string" ? value : "";
};

/**
 * Which unique constraint a P2002 hit, from a Prisma error's `meta`. Two
 * shapes are read, because which one shows up depends on the connector and
 * neither is typed:
 *
 * - The flat shape Prisma documents: `meta.target`, an array of field names
 *   or a single constraint-name string.
 * - **`meta.driverAdapterError.cause.constraint.fields` (an array of field
 *   names) or `.constraint.name` (a constraint name)** — observed directly
 *   from a real P2002 raised against this schema under Prisma 7's driver
 *   adapter, 2026-09-11. `meta.target` is absent entirely in that case, so
 *   reading only the flat shape silently finds nothing and every duplicate
 *   falls through to the generic message. This was a real, shipped bug —
 *   caught by a browser check, not by the unit tests, because the unit
 *   tests had hand-built the flat shape and were asserting their own mock
 *   rather than reality.
 *
 * Every level of both shapes is optional and untyped, so this walks it with
 * `unknown` and narrows at each step rather than asserting a shape.
 *
 * **The field-name check order is load-bearing.** "username" contains
 * "name", and `User_username_key` contains both "name" and "username" —
 * checking `name` first would label every duplicate handle a duplicate
 * company.
 */
export function uniqueMessage(meta: unknown): string {
  const metaRecord = asRecord(meta);
  const driverAdapterError = asRecord(metaRecord?.driverAdapterError);
  const cause = asRecord(driverAdapterError?.cause);
  const constraint = asRecord(cause?.constraint);

  const text = [fieldText(metaRecord?.target), fieldText(constraint?.fields), fieldText(constraint?.name)]
    .join(",")
    .toLowerCase();

  if (text.includes("username")) return "That username is taken.";
  if (text.includes("email")) return "That email address is already in use.";
  if (text.includes("name")) return "Another customer already has that name.";
  return "Something about that customer is already in use.";
}
