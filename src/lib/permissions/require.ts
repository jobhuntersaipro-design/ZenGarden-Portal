import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import {
  UnauthorizedError,
  getSessionUser,
  requireUser,
  type SessionUser,
} from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { OPS_ROLES } from "@/lib/permissions/roles";
import {
  permissionAction,
  type PermissionKey,
} from "@/lib/permissions/actions";

/**
 * The viewer's own granted keys.
 *
 * `cache()` dedupes within one request and nothing caches across requests: at
 * most twenty rows for one role, and a saved grid is live on the very next
 * request with nothing to invalidate and no deploy. That is the strictest
 * reading of the brief's "cache OK, invalidate on save".
 */
export const loadGrants = cache(
  async (role: Role): Promise<ReadonlySet<string>> => {
    const rows = await prisma.permissionGrant.findMany({
      where: { role, granted: true },
      select: { action: true },
    });
    return new Set(rows.map((row) => row.action));
  },
);

export async function roleCan(role: Role, key: PermissionKey): Promise<boolean> {
  // A shop account is not an ops account, whatever the table says.
  if (role === Role.CLIENT) return false;
  // The lock-out guarantee. Stronger than disabling the column in the grid,
  // because no saved edit, no direct SQL write and no corrupt row can take the
  // portal away from its administrators. The stored SUPER_ADMIN rows exist so
  // the grid reads from one source; the runtime ignores them.
  if (role === Role.SUPER_ADMIN) return true;
  return (await loadGrants(role)).has(key);
}

/**
 * For rendering. Never the only check — a hidden button is not a permission,
 * so the action behind it calls `requirePermission` as well.
 */
export async function can(key: PermissionKey): Promise<boolean> {
  const user = await getSessionUser();
  return user ? roleCan(user.role, key) : false;
}

/**
 * The guard. Throws `UnauthorizedError`, which every action file's local
 * `guard()` already catches and turns into `{ success: false, error }`, so no
 * action's result shape changes.
 */
export async function requirePermission(
  key: PermissionKey,
  message?: string,
): Promise<SessionUser> {
  const user = await requireUser();
  if (await roleCan(user.role, key)) return user;
  throw new UnauthorizedError(
    message ?? `Your role can't ${permissionAction(key).label.toLowerCase()}.`,
  );
}

/**
 * The same guard, for a **page** rather than an action.
 *
 * A Server Component has no `{ success: false, error }` to return, and there
 * is no `error.tsx` anywhere in this app — so a bare `requirePermission` in a
 * page renders Next's own 500 for a reader whose role simply may not look
 * here. That is both wrong and louder than the truth.
 *
 * `notFound()` instead, which is the treatment `/admin` and `/shop` already
 * get in `src/proxy.ts` and for the same reason: a role that may not open a
 * page should not learn it is a real one. The content is right; the status is
 * 200 rather than 404 on a streamed layout, which is the app-wide gap
 * recorded on 2026-09-10 and not this guard's to fix.
 *
 * Signed out is impossible here in practice — `(portal)/layout.tsx` redirects
 * first — so the 404 covers both cases without a second branch.
 */
export async function requirePagePermission(
  key: PermissionKey,
): Promise<SessionUser> {
  try {
    return await requirePermission(key);
  } catch (cause) {
    if (cause instanceof UnauthorizedError) notFound();
    throw cause;
  }
}

/**
 * Which ops roles hold a key — for the disabled Advance button's reason, so it
 * can say who *does* advance this stage rather than only that you do not.
 */
export async function rolesWithPermission(key: PermissionKey): Promise<Role[]> {
  const rows = await prisma.permissionGrant.findMany({
    where: { action: key, granted: true, role: { not: Role.SUPER_ADMIN } },
    select: { role: true },
  });
  const held = new Set<Role>(rows.map((row) => row.role));
  return OPS_ROLES.filter(
    (role) => role === Role.SUPER_ADMIN || held.has(role),
  );
}

/**
 * The status a refused route handler should answer with.
 *
 * 403, not 401, when the caller is authenticated and simply may not do this —
 * the brief's own requirement that a planner's forged advance be refused by
 * the API and not only by a hidden button. 401 is reserved for "no session".
 */
export const unauthorizedStatus = (cause: UnauthorizedError): 401 | 403 =>
  cause.message === "You are not signed in." ? 401 : 403;
