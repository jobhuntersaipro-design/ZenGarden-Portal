import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/r2";

/** A ten-minute link to a container photo (its thumbnail with `?thumb=1`) or video. Staff. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; containerId: string; mediaId: string }> },
) {
  const { denied } = await guardRoute("shipment.view");
  if (denied) return denied;
  const { id: shipmentId, containerId, mediaId } = await params;
  const media = await prisma.containerMedia.findFirst({
    where: { id: mediaId, containerId, container: { shipmentId } },
    select: { r2Key: true, thumbKey: true, originalName: true },
  });
  if (!media) return NextResponse.json({ error: "That file is gone." }, { status: 404 });
  const search = new URL(request.url).searchParams;
  const thumb = search.get("thumb") === "1" && media.thumbKey;
  const download = search.get("download") === "1";
  return NextResponse.redirect(
    await presignGet(thumb ? media.thumbKey! : media.r2Key, download ? media.originalName : undefined),
    302,
  );
}
