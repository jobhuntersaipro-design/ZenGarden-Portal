import { NextResponse } from "next/server";
import { UnauthorizedError, requireClient } from "@/lib/auth-guards";
import { unauthorizedStatus } from "@/lib/permissions/require";
import { findBuyerContainerMedia } from "@/lib/queries/buyer-containers";
import { presignGet } from "@/lib/r2";

/**
 * A ten-minute link to a container photo or video on the signed-in buyer's
 * own order (Phase 68). The media must hang off a container loaded with
 * this order, and the order must be the caller's buyer's: anything else is
 * 404. The scoping lives in `buyer-containers.ts`, the one module allowed to
 * cross from a shop page into the staff shipping tables, with a pinned select.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  let buyerId: string;
  try {
    ({ buyerId } = await requireClient());
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json({ error: cause.message }, { status: unauthorizedStatus(cause) });
    }
    throw cause;
  }
  const { id, mediaId } = await params;
  const media = await findBuyerContainerMedia(buyerId, id, mediaId);
  if (!media) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const search = new URL(request.url).searchParams;
  const thumb = search.get("thumb") === "1" && media.thumbKey;
  const download = search.get("download") === "1";
  return NextResponse.redirect(
    await presignGet(thumb ? media.thumbKey! : media.r2Key, download ? media.originalName : undefined),
    302,
  );
}
