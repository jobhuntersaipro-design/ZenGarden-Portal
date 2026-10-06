import { NextResponse } from "next/server";
import { guardOrderDocumentRead } from "@/lib/purchase-order-document-guard";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/r2";

export type PurchaseOrderDocumentUrlResponse = { url: string; mimeType: string };

/**
 * A short-lived link to one file on this order. The id in the path has to be
 * a row of *this* order — a document id from another order answers 404.
 * The link expires (ten minutes, the same as every other read URL) and is
 * only minted after `po.view`. There is no public object URL.
 *
 * Buyers do not use this route. A later ticket can add a shop route scoped
 * to `requireClient().buyerId` rather than widening this one.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { denied } = await guardOrderDocumentRead();
  if (denied) return denied;
  const { id: purchaseOrderId, documentId } = await params;

  const document = await prisma.purchaseOrderDocument.findFirst({
    where: { id: documentId, purchaseOrderId },
    select: { r2Key: true, mimeType: true, originalName: true },
  });
  if (!document) return NextResponse.json({ error: "That file is gone." }, { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const url = await presignGet(document.r2Key, download ? document.originalName : undefined);
  if (download) return NextResponse.redirect(url, 302);
  return NextResponse.json({
    url,
    mimeType: document.mimeType,
  } satisfies PurchaseOrderDocumentUrlResponse);
}
