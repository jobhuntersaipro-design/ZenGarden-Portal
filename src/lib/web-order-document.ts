import "server-only";
import { WebOrderStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { loadSupplierDetails } from "@/lib/org-settings";
import { renderPurchaseOrderPdf } from "@/lib/pdf/purchase-order";
import { prisma } from "@/lib/prisma";
import { buildPoDocumentFromOrder } from "@/lib/purchase-order-document";
import { loadWebOrderDocumentSource } from "@/lib/queries/web-orders";
import {
  PENDING_KEY_PREFIX,
  documentKey,
  getObjectBytes,
  putObject,
} from "@/lib/r2";

/**
 * The purchase order for a shop order: rendered, stored in R2 and filed as a
 * `Document` (Phase 37).
 *
 * **Idempotent.** An order that already has a file gets its bytes read back
 * rather than a second render, so calling this at submit and again at confirm
 * produces one document, not two. That is what lets `confirmWebOrder` repair
 * an order whose render failed the first time without risking a duplicate.
 *
 * **Never inside the order's own transaction.** Rendering takes hundreds of
 * milliseconds and R2 is a network call; holding a Postgres transaction open
 * across either would be a lock nobody needs. The consequence is deliberate
 * and stated at the call site: an order can exist with no file, and the file
 * is fetched later.
 *
 * The wording along the foot of the page is the caller's, because it is the
 * one thing that differs between a document sent and a document confirmed.
 */
const SENT_FOOTNOTE =
  "Sent to our team. They confirm the figures and come back to you.";

export type WebOrderDocument = {
  documentId: string;
  /** "W-2609-00015 purchase order.pdf" — what an email attachment is called. */
  filename: string;
  bytes: Uint8Array;
};

export async function attachWebOrderDocument(
  webOrderId: string,
): Promise<WebOrderDocument | null> {
  try {
    const source = await loadWebOrderDocumentSource(webOrderId);
    if (!source) return null;
    // A DRAFT is a live cart. There is no purchase order to draw for one, and
    // drawing it would put prices on paper before they were snapshotted.
    if (
      source.status !== WebOrderStatus.SUBMITTED &&
      source.status !== WebOrderStatus.CONFIRMED
    ) {
      return null;
    }

    const filename = `${source.reference} purchase order.pdf`;

    if (source.documentId) {
      const existing = await prisma.document.findUnique({
        where: { id: source.documentId },
        select: { id: true, r2Key: true, originalName: true },
      });
      if (existing) {
        return {
          documentId: existing.id,
          filename: existing.originalName,
          bytes: await getObjectBytes(existing.r2Key),
        };
      }
      // The row is gone (SetNull left the column dangling in no other case).
      // Fall through and write a new one.
    }

    const bytes = await renderPurchaseOrderPdf(
      buildPoDocumentFromOrder({
        order: source.order,
        supplier: await loadSupplierDetails(),
        orderDate: source.submittedAt ? formatDate(source.submittedAt) : "—",
        requestedDate: source.requestedDate ? formatDate(source.requestedDate) : null,
      }),
      SENT_FOOTNOTE,
    );

    // `r2Key` is unique and contains the row's own id, which does not exist
    // until the row does — the placeholder Phase 03 introduced for exactly
    // this, and which `deleteOrphans` knows names no object.
    const created = await prisma.document.create({
      data: {
        r2Key: `${PENDING_KEY_PREFIX}${webOrderId}`,
        originalName: filename,
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        // The buyer's own contact. They are who the document is for, and the
        // ops uploader filter excludes CLIENT users so this cannot appear
        // there as if they had uploaded a scan.
        uploadedById: source.placedById,
      },
      select: { id: true },
    });

    const key = documentKey(created.id, "pdf");
    try {
      await putObject(key, bytes, "application/pdf");
    } catch (cause) {
      // The row names an object that does not exist. Remove it rather than
      // leave a Document the buyer can click and never load.
      await prisma.document.delete({ where: { id: created.id } }).catch(() => {});
      throw cause;
    }

    await prisma.$transaction([
      prisma.document.update({ where: { id: created.id }, data: { r2Key: key } }),
      prisma.webOrder.update({
        where: { id: webOrderId },
        data: { documentId: created.id },
      }),
    ]);

    return { documentId: created.id, filename, bytes };
  } catch (cause) {
    // Never throws: the order is already placed, and a missing file must not
    // read to the caller as a failed order.
    console.error("[web-order-document] attachWebOrderDocument", cause);
    return null;
  }
}
