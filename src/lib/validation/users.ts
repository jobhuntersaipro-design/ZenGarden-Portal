import { z } from "zod";
import { OPS_ROLES } from "@/lib/permissions/roles";
import { emailSchema, passwordSchema } from "@/lib/validation/auth";

/**
 * Portal roles only. CLIENT is deliberately absent: the admin drawer must not
 * be able to mint a customer contact or promote one to staff, and a client is
 * created from the buyer's page with a buyer attached (Phase 15).
 *
 * Phase 48 widened this from two roles to five. `OPS_ROLES` is the one list,
 * so a role cannot exist in the grid and be unassignable here.
 */
export const userRoleSchema = z.enum(OPS_ROLES);

export type StaffRole = z.infer<typeof userRoleSchema>;

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
