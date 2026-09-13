import { Role } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

/**
 * One `SIGNED_IN` row per successful customer sign-in.
 *
 * This is the only durable record of it. `LoginAttempt` is rate-limit state
 * and is swept after 24 hours (`src/lib/rate-limit.ts`); `User.lastActiveAt`
 * is a single timestamp that the next sign-in overwrites.
 *
 * Its own module rather than a function inside `auth.ts` so it can be tested
 * without standing up NextAuth, and so the failure rule below is visible on
 * its own: this is called from `authorize`, where a rejected promise would
 * turn a correct password into a refused sign-in.
 */
export async function recordClientSignIn(user: {
  id: string;
  role: Role;
  buyerId: string | null;
}): Promise<void> {
  if (user.role !== Role.CLIENT || !user.buyerId) return;
  try {
    await audit(prisma, {
      action: "SIGNED_IN",
      actorId: user.id,
      buyerId: user.buyerId,
    });
  } catch (cause) {
    console.error("[auth] could not record a client sign-in", cause);
  }
}
