import { z } from "zod";

/**
 * One password schema for every path that sets a password: the admin-set
 * temporary password (Phase 09), the reset link and the change-password form
 * (docs/specs/02-auth.md §4).
 *
 * The 72 ceiling is bcrypt's: it silently ignores everything past the 72nd
 * *byte*, so a longer secret would be a lie. The byte check catches the
 * multibyte case that a character count alone would let through.
 */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(72, "Use at most 72 characters.")
  .refine((value) => /\p{L}/u.test(value), {
    message: "Include at least one letter.",
  })
  .refine((value) => /\d/.test(value), {
    message: "Include at least one digit.",
  })
  .refine((value) => new TextEncoder().encode(value).length <= 72, {
    message: "Use at most 72 characters.",
  });

/**
 * Lower-cased and trimmed: every lookup in the auth code uses this form. The
 * normalisation runs *before* validation — a trailing space pasted from a
 * password manager is not a malformed address.
 */
export const emailSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.email("Enter a valid email address."),
);

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

/**
 * `currentPassword` is optional here because the forced case (an admin set the
 * password and flagged `mustChangePassword`) has nothing for the user to
 * recall. The action requires it whenever the flag is not set.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  password: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
