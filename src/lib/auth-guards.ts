import { Role } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";

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
};

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
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== Role.SUPER_ADMIN) {
    throw new UnauthorizedError("This action needs super admin access.");
  }
  return user;
}
