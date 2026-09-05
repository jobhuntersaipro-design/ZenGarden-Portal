import { Role } from "@/generated/prisma/enums";

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
  role: Role;
  mustChangePassword: boolean;
};

/**
 * Phase 01 stub. Auth.js replaces this in Phase 02; the signature is what
 * callers depend on, so nothing above it changes when the real session lands.
 */
async function getSession(): Promise<SessionUser | null> {
  return null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
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
