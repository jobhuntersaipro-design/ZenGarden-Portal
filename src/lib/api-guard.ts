import { NextResponse } from "next/server";
import { UnauthorizedError, type SessionUser } from "@/lib/auth-guards";
import type { PermissionKey } from "@/lib/permissions/actions";
import { requirePermission, unauthorizedStatus } from "@/lib/permissions/require";

/**
 * A route handler's permission check, answered as JSON with the right status
 * rather than thrown — a route cannot return `{ success: false }` the way an
 * action does.
 */
export async function guardRoute(
  permission: PermissionKey,
): Promise<{ user: SessionUser; denied: null } | { user: null; denied: NextResponse }> {
  try {
    return { user: await requirePermission(permission), denied: null };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return {
        user: null,
        denied: NextResponse.json(
          { error: cause.message },
          { status: unauthorizedStatus(cause) },
        ),
      };
    }
    throw cause;
  }
}
