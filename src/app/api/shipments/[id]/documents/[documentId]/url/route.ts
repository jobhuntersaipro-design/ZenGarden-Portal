import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/r2";

/**
 * A ten-minute link to one paper of this shipment, current or earlier. Staff
 * only (`shipment.view`): a buyer fails `requireUser` inside it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { denied } = await guardRoute("shipment.view");
  if (denied) return denied;
  const { id: shipmentId, documentId } = await params;
  const doc = await prisma.shipmentDocument.findFirst({
    where: { id: documentId, shipmentId },
    select: { r2Key: true, mimeType: true, originalName: true },
  });
  if (!doc) return NextResponse.json({ error: "That file is gone." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const url = await presignGet(doc.r2Key, download ? doc.originalName : undefined);
  if (download) return NextResponse.redirect(url, 302);
  return NextResponse.json({ url, mimeType: doc.mimeType });
}
