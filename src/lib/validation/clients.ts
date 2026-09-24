import { z } from "zod";
import { emailSchema } from "@/lib/validation/auth";
import { optionalText } from "@/lib/validation/common";
import { paymentTermsSchema } from "@/lib/payment-terms";

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

/**
 * A new buyer is a company and the person who signs in for it
 * (docs/specs/26-buyer-management.md §3). The contact always becomes the
 * shop login — there is no switch and no separate login block — and their
 * handle is derived from the email (`src/lib/username.ts`), so it is not
 * asked for here. Address, payment terms and remark sit behind a disclosure
 * on the form and are optional.
 */
export const createBuyerSchema = z.object({
  name: z.string().min(1, "A buyer needs a name").max(200),
  contact: z.object({
    name: z.string().min(1, "A contact name is required").max(120),
    email: emailSchema,
    phone: phoneSchema,
  }),
  /**
   * The one market this buyer buys in — what their shop is scoped by. Chosen
   * from the MARKET vocabulary (`/admin/catalogue`), but stored as free text
   * like `Product.market` itself, so a market entered here and one entered on
   * a product are the same value and match each other.
   *
   * **Required as of 2026-09-24, on creation only.** A buyer with no market
   * can sign in and see nothing at all, so a new one entered without it is an
   * account that looks set up and cannot order — and nobody finds out until
   * the customer says so. It is asked for at the one moment somebody is
   * already deciding everything else about them.
   *
   * The edit path (`buyerPatchSchema`) deliberately stays nullable: the
   * buyers already on record carry no market, and refusing a blank there
   * would mean no other field on those rows could be saved until somebody
   * settled the market too — the same fail-closed trap in the opposite
   * direction. Trimmed, so a picker that somehow sent whitespace is refused
   * rather than stored as a market nothing matches.
   */
  market: z
    .string({ error: "Choose the market this buyer buys in" })
    .trim()
    .min(1, "Choose the market this buyer buys in")
    .max(56),
  address: optionalText(500),
  paymentTerms: paymentTermsSchema,
  remark: optionalText(2000),
});

export type CreateBuyerInput = z.input<typeof createBuyerSchema>;
