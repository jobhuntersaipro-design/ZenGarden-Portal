import { NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/auth-guards";
import {
  requirePermission,
  unauthorizedStatus,
} from "@/lib/permissions/require";
import { reviewQueueCount } from "@/lib/queries/purchase-orders";

export const dynamic = "force-dynamic";

/**
 * The sidebar's review-queue number, re-read from the browser (Phase 46).
 *
 * The count is drawn by the portal layout, and a layout is not re-rendered on
 * a client-side navigation. Measured on development: a shop order arriving
 * while someone was on /buyers left the sidebar at 4 while the page's own
 * queue section read 5, until a reload. `ReviewCountProvider` asks here on
 * every navigation, on focus and once a minute. Staff only, like every
 * portal query.
 */
export async function GET() {
  try {
    await requirePermission("po.view");
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: cause.message },
        { status: unauthorizedStatus(cause) },
      );
    }
    throw cause;
  }

  return NextResponse.json(
    { count: await reviewQueueCount() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
