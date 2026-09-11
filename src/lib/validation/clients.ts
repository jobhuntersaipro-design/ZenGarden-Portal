import { z } from "zod";
import { emailSchema } from "@/lib/validation/auth";
import { optionalEmail, optionalText } from "@/lib/validation/common";

/**
 * A display handle. Lower-cased and trimmed before validation, exactly as
 * `emailSchema` is: normalising on the way in is what makes a plain unique
 * index sufficient, and without it `Acme` and `acme` are two rows.
 *
 * NEVER an authentication identifier — `signInSchema` takes an email and
 * nothing else, and `src/lib/validation/auth.test.ts` asserts that it stays
 * that way.
 */
export const usernameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9._-]{2,31}$/,
      "Use 3–32 characters: letters, numbers, dots, dashes or underscores, starting with a letter or number.",
    ),
);

/** Free text: Malaysian numbers are written a dozen ways and we do not parse them. */
export const phoneSchema = optionalText(32);

/**
 * A buyer's own contact. There is no role field: the actions always write
 * CLIENT, and the buyer comes from the page the invite was sent from, so
 * neither can be chosen by the caller.
 */
export const inviteContactSchema = z.object({
  buyerId: z.string().min(1),
  name: z.string().min(1, "A name is required").max(120),
  email: emailSchema,
  username: usernameSchema,
  phone: phoneSchema,
});

export type InviteContactInput = z.input<typeof inviteContactSchema>;

/** Name, username and phone. Not the email: that is how we identify the account. */
export const contactPatchSchema = inviteContactSchema.pick({
  name: true,
  username: true,
  phone: true,
});

export type ContactPatch = z.input<typeof contactPatchSchema>;

export const createCustomerSchema = z.object({
  company: z.object({
    name: z.string().min(1, "A customer needs a name").max(200),
    address: optionalText(500),
    paymentTerms: optionalText(120),
    remark: optionalText(2000),
    contactName: optionalText(120),
    email: optionalEmail,
    phone: phoneSchema,
  }),
  /** Omitted when the reader did not open "Give them a shop login". */
  contact: inviteContactSchema.omit({ buyerId: true }).optional(),
  sendInvite: z.boolean().default(true),
});

export type CreateCustomerInput = z.input<typeof createCustomerSchema>;
