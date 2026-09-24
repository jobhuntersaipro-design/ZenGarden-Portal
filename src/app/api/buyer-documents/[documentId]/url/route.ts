import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/r2";

export type BuyerDocumentUrlResponse = { url: string; mimeType: string };

/**
 * A short-lived link to one buyer document, for the preview or — with
 * `?download=1` — as an attachment under its original name. Staff with
 * `buyer.view` only; there is deliberately no shop twin of this route.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { denied } = await guardRoute("buyer.view");
  if (denied) return denied;
  const { documentId } = await params;

  const document = await prisma.buyerDocument.findUnique({
    where: { id: documentId },
    select: { r2Key: true, mimeType: true, originalName: true },
  });
  if (!document) return NextResponse.json({ error: "That file is gone." }, { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const url = await presignGet(document.r2Key, download ? document.originalName : undefined);
  if (download) return NextResponse.redirect(url, 302);
  return NextResponse.json({ url, mimeType: document.mimeType } satisfies BuyerDocumentUrlResponse);
}
