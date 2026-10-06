import { NextResponse } from "next/server";
import { UnauthorizedError, requireClient } from "@/lib/auth-guards";
import { unauthorizedStatus } from "@/lib/permissions/require";
import { findBuyerOrderDocument } from "@/lib/queries/purchase-order-documents";
import { presignGet } from "@/lib/r2";

export type ShopOrderDocumentUrlResponse = { url: string; mimeType: string };

/**
 * A short-lived link to one file on the signed-in buyer's own purchase order.
 *
 * Separate from `/api/purchase-orders/[id]/documents/[documentId]/url`, which
 * is `po.view` and does not know which buyer an order belongs to. This one
 * asks `requireClient()` and then `findBuyerOrderDocument`, so the row has to
 * hang off a purchase order whose `buyerId` is the caller's. Another buyer's
 * file, or a file on a different order, is 404. Account documents
 * (`BuyerDocument`) are not reachable here.
 *
 * `?download=1` answers a 302 to the presigned URL so a plain link can
 * download it. Without that, the preview asks for `{ url, mimeType }`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  let buyerId: string;
  try {
    ({ buyerId } = await requireClient());
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: cause.message },
        { status: unauthorizedStatus(cause) },
      );
    }
    throw cause;
  }

  const { id: purchaseOrderId, documentId } = await params;
  const document = await findBuyerOrderDocument(buyerId, purchaseOrderId, documentId);
  if (!document) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const url = await presignGet(document.r2Key, download ? document.originalName : undefined);
  if (download) return NextResponse.redirect(url, 302);
  return NextResponse.json({
    url,
    mimeType: document.mimeType,
  } satisfies ShopOrderDocumentUrlResponse);
}
