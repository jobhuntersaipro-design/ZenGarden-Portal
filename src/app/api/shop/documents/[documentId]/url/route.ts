import { NextResponse } from "next/server";
import { UnauthorizedError, requireClient } from "@/lib/auth-guards";
import { findClientDocument } from "@/lib/queries/documents";
import { isPendingKey, presignGet } from "@/lib/r2";

export type ShopDocumentUrlResponse = { url: string; mimeType: string };

/**
 * The buyer's own purchase order (Phase 37).
 *
 * A separate route from `/api/documents/[id]/url` rather than a widening of
 * it, which is exactly what that route's own comment asks for: it is ops-wide
 * and has no ownership check by design, and Phase 35 recorded that exposing it
 * to clients would hand one buyer every other buyer's scanned orders.
 *
 * Two things scope this one:
 *
 * - `requireClient()`, so an ops session cannot reach it and a guest gets 401.
 * - `findClientDocument`, which matches only a document hanging off one of
 *   **this buyer's own** web orders. A scan the ops team uploaded has no
 *   `webOrder` at all, so no guessed id can reach one through here.
 *
 * `?download=1` pins the filename; `?redirect=1` answers a 302 to the
 * presigned URL so a plain `<a href>` can be the whole client, with no fetch
 * and no key ever rendered into the page.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  let buyerId: string;
  try {
    ({ buyerId } = await requireClient());
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json({ error: cause.message }, { status: 401 });
    }
    throw cause;
  }

  const { documentId } = await params;
  const document = await findClientDocument(buyerId, documentId);
  // A row still on its placeholder key names no object: the upload failed
  // between the row and the put, and a presigned URL for it would 404 at R2.
  if (!document || isPendingKey(document.r2Key)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const search = new URL(request.url).searchParams;
  const url = await presignGet(
    document.r2Key,
    search.get("download") === "1" ? document.originalName : undefined,
  );

  if (search.get("redirect") === "1") {
    // 302, not 307: this is a different resource, not the same one moved, and
    // the presigned URL is good for ten minutes only.
    return NextResponse.redirect(url, 302);
  }

  return NextResponse.json({
    url,
    mimeType: document.mimeType,
  } satisfies ShopDocumentUrlResponse);
}
