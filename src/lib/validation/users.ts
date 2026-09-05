import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { emailSchema, passwordSchema } from "@/lib/validation/auth";

export const userRoleSchema = z.enum([Role.MEMBER, Role.SUPER_ADMIN]);

export const createUserSchema = z.object({
  name: z.string().min(1, "A name is required").max(120),
  email: emailSchema,
  role: userRoleSchema,
  /** Optional: without one, the user signs in with Google. */
  password: passwordSchema.optional(),
  mustChangePassword: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, "A name is required").max(120),
  email: emailSchema,
  role: userRoleSchema,
  active: z.boolean(),
});

export const setPasswordSchema = z.object({
  password: passwordSchema,
  mustChange: z.boolean().default(true),
});

export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;

/**
 * Active unless told otherwise; Invited means "created but never used".
 *
 * The three signals have to agree: no password to sign in with, no linked
 * Google account, and never seen. Any one of those alone would mislabel a
 * real user — a Google-only member has no password, and a password user who
 * has not logged in this week has no recent activity.
 */
export function deriveUserStatus(user: {
  disabledAt: Date | null;
  passwordHash: string | null;
  accountCount: number;
  lastActiveAt: Date | null;
}): "Disabled" | "Invited" | "Active" {
  if (user.disabledAt) return "Disabled";
  if (!user.passwordHash && user.accountCount === 0 && user.lastActiveAt === null) {
    return "Invited";
  }
  return "Active";
}
