import { NextResponse } from "next/server";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { unauthorizedStatus } from "@/lib/permissions/require";

/** Certificates live in the admin room: super admin only. Null means allowed. */
export async function superAdminRoute(): Promise<NextResponse | null> {
  try {
    await requireSuperAdmin();
    return null;
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json({ error: cause.message }, { status: unauthorizedStatus(cause) });
    }
    throw cause;
  }
}
