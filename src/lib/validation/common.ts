import { z } from "zod";
import { emailSchema } from "@/lib/validation/auth";

/** `""` and whitespace become null, so a cleared field clears the column. */
export const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .pipe(z.string().max(max).nullable());

/**
 * Optional, but a real address when it is there — a contact's inbox may be
 * blank, and `emailSchema` alone rejects `""`, but a typo in one must still
 * be caught.
 *
 * Written as a `transform` rather than `.pipe(z.union([z.null(), emailSchema]))`:
 * `emailSchema` is itself a `z.preprocess`, whose declared input type is
 * `unknown`, and zod 4's `.pipe()` requires the piped-into schema's input type
 * to be assignable to the narrower `string | null` that `optionalText`
 * produces — `unknown` fails that check under strict mode even though every
 * value it could ever receive is fine at runtime.
 */
export const optionalEmail = optionalText(200).transform((value, ctx) => {
  if (value === null) return null;
  const parsed = emailSchema.safeParse(value);
  if (!parsed.success) {
    ctx.addIssue(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
    return z.NEVER;
  }
  return parsed.data;
});
