import { z } from "zod";
import { emailSchema } from "@/lib/validation/auth";

/**
 * A buyer's own contact. There is no role field: `inviteBuyerContact` always
 * writes CLIENT, and the buyer comes from the page the invite was sent from,
 * so neither can be chosen by the caller.
 */
export const inviteContactSchema = z.object({
  buyerId: z.string().min(1),
  name: z.string().min(1, "A name is required").max(120),
  email: emailSchema,
});

export type InviteContactInput = z.infer<typeof inviteContactSchema>;
