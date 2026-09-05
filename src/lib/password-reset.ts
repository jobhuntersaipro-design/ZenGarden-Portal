import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** A reset link lives 30 minutes and works once (docs/specs/02-auth.md §4). */
export const RESET_TOKEN_TTL_MS = 30 * 60_000;

/**
 * Only the hash is stored, so a database read never yields a usable link.
 * sha256 is right here rather than bcrypt: the token is 32 random bytes, so
 * there is no low-entropy secret to slow an attacker down over.
 */
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/**
 * True when the token exists, has not expired and has not been used. Kept out
 * of `src/actions/auth.ts` on purpose: everything exported from a `"use
 * server"` module is a callable endpoint, and this is a page's read, not an
 * action anyone should be able to invoke.
 */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!token) return false;
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, usedAt: true },
  });
  return Boolean(row && !row.usedAt && row.expiresAt > new Date());
}
