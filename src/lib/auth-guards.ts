import { Role } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Thrown by the guards and caught by Server Actions, which turn it into
 * `{ success: false, error }`. It must never reach the client as a throw.
 */
export class UnauthorizedError extends Error {
  constructor(message = "You are not signed in.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: Role;
  mustChangePassword: boolean;
  /** Set if and only if `role` is CLIENT — a database CHECK enforces it. */
  buyerId: string | null;
};

/** Ops staff. A CLIENT is signed in but is not a user of the portal. */
export const isStaff = (role: Role) => role !== Role.CLIENT;

/**
 * The session as the rest of the app wants it. `auth()` runs the `jwt`
 * callback in `src/lib/auth.ts`, so a disabled, deleted or signed-out-
 * everywhere user resolves to null here even while their cookie is still warm.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? user.email,
    image: user.image ?? null,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    buyerId: user.buyerId ?? null,
  };
}

/**
 * Any signed-in account, client included.
 *
 * Only for work that is scoped to the caller themselves — `changePassword` is
 * the single case, because a client arrives with `mustChangePassword` set and
 * has to be able to clear it. Everything else wants `requireUser`.
 */
export async function requireAccount(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * An ops user.
 *
 * Changed in Phase 15: this used to mean "signed in". Every Server Action and
 * every route handler in the app already calls it, and every one of them was
 * written when ops staff were the only kind of user — so redefining it here is
 * what makes all of them client-proof at once, and what makes code written
 * later fail closed rather than open.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await requireAccount();
  if (!isStaff(user.role)) {
    throw new UnauthorizedError("This is not a portal account.");
  }
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== Role.SUPER_ADMIN) {
    throw new UnauthorizedError("This action needs super admin access.");
  }
  return user;
}

/**
 * A client, with the buyer they act for.
 *
 * The buyer is re-read rather than taken from the token: the JWT refreshes on a
 * five-minute interval (`src/lib/auth.ts`), and revoking a contact or moving
 * them to another buyer has to take effect now, not within five minutes. One
 * lookup by primary key — the same trade `(portal)/layout.tsx` already makes
 * for the sidebar.
 */
export async function requireClient(): Promise<SessionUser & { buyerId: string }> {
  const user = await requireAccount();
  if (user.role !== Role.CLIENT) {
    throw new UnauthorizedError("This is not a shop account.");
  }
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { buyerId: true },
  });
  if (!fresh?.buyerId) {
    throw new UnauthorizedError("This account is not linked to a buyer.");
  }
  return { ...user, buyerId: fresh.buyerId };
}
