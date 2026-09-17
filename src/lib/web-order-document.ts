import "server-only";
import { WebOrderStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { loadSupplierDetails } from "@/lib/org-settings";
import { renderPurchaseOrderPdf } from "@/lib/pdf/purchase-order";
import { prisma } from "@/lib/prisma";
import {
  buildPoDocumentFromOrder,
  type PoDocumentData,
} from "@/lib/purchase-order-document";
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
 * rather than a second render, so calling this twice produces one document,
 * not two. That is what lets `confirmWebOrder` repair an order whose render
 * failed the first time without risking a duplicate.
 *
 * **`redraw` renders again into the same object** (Phase 42). The file sent at
 * submit cannot carry an expected delivery date, because nobody has promised
 * one yet; confirming, and moving that date afterwards, redraw it. The
 * `Document` row, its id and its R2 key stay the same, so every link to it —
 * the buyer's Download, the ops document pane — reads the new bytes.
 *
 * **Never inside the order's own transaction.** Rendering takes hundreds of
 * milliseconds and R2 is a network call; holding a Postgres transaction open
 * across either would be a lock nobody needs. The consequence is deliberate
 * and stated at the call site: an order can exist with no file, and the file
 * is fetched later.
 *
 * The wording along the foot of the page follows the order's status — the
 * same two sentences the buyer's order page prints under its preview.
 */
const SENT_FOOTNOTE =
  "Sent to our team. They confirm the figures and come back to you.";
const CONFIRMED_FOOTNOTE =
  "Confirmed by our team. This is the order we are fulfilling.";

export type WebOrderDocument = {
  documentId: string;
  /** "W-2609-00015 purchase order.pdf" — what an email attachment is called. */
  filename: string;
  bytes: Uint8Array;
};

type WebOrderDocumentSource = NonNullable<
  Awaited<ReturnType<typeof loadWebOrderDocumentSource>>
>;

/**
 * What the file prints, as data. Shared by the renderer and the emails, so a
 * mail's line table and the PDF on it cannot say different things.
 */
async function documentDataFor(source: WebOrderDocumentSource): Promise<PoDocumentData> {
  const confirmed = source.status === WebOrderStatus.CONFIRMED;
  return buildPoDocumentFromOrder({
    order: source.order,
    supplier: await loadSupplierDetails(),
    orderDate: source.submittedAt ? formatDate(source.submittedAt) : "—",
    // Only once the team has confirmed: before that there is no promise
    // to print, and the cell reads "—".
    deliveryDate:
      confirmed && source.deliveryDate ? formatDate(source.deliveryDate) : null,
    // Anything submitted or received is waiting; a declined order is not.
    awaitingConfirmation:
      source.status === WebOrderStatus.SUBMITTED ||
      source.status === WebOrderStatus.RECEIVED,
  });
}

/**
 * The order's document data for an email's facts and line table, without
 * rendering anything. Any status but DRAFT: a declined order's email still
 * shows what the buyer sent. Never throws; null when it cannot be read.
 */
export async function loadWebOrderDocumentData(
  webOrderId: string,
): Promise<PoDocumentData | null> {
  try {
    const source = await loadWebOrderDocumentSource(webOrderId);
    if (!source || source.status === WebOrderStatus.DRAFT) return null;
    return await documentDataFor(source);
  } catch (cause) {
    console.error("[web-order-document] loadWebOrderDocumentData", cause);
    return null;
  }
}

/**
 * The file already stored for an order, read back as it is — no render, no
 * write, any status. For the decline email, which shows what the buyer sent
 * and must not redraw a document for an order nobody is fulfilling. Never
 * throws.
 */
export async function readStoredWebOrderDocument(
  webOrderId: string,
): Promise<WebOrderDocument | null> {
  try {
    const order = await prisma.webOrder.findUnique({
      where: { id: webOrderId },
      select: { document: { select: { id: true, r2Key: true, originalName: true } } },
    });
    const stored = order?.document;
    if (!stored) return null;
    return {
      documentId: stored.id,
      filename: stored.originalName,
      bytes: await getObjectBytes(stored.r2Key),
    };
  } catch (cause) {
    console.error("[web-order-document] readStoredWebOrderDocument", cause);
    return null;
  }
}

export async function attachWebOrderDocument(
  webOrderId: string,
  options: { redraw?: boolean } = {},
): Promise<WebOrderDocument | null> {
  try {
    const source = await loadWebOrderDocumentSource(webOrderId);
    if (!source) return null;
    // A DRAFT is a live cart. There is no purchase order to draw for one, and
    // drawing it would put prices on paper before they were snapshotted.
    // RECEIVED is accepted because `confirmWebOrder` calls this while the
    // order is still in that state, before its transaction moves it to
    // CONFIRMED — and the buyer's own document must draw for the whole time
    // the team holds the order, not just once it is confirmed.
    if (
      source.status !== WebOrderStatus.SUBMITTED &&
      source.status !== WebOrderStatus.RECEIVED &&
      source.status !== WebOrderStatus.CONFIRMED
    ) {
      return null;
    }

    const filename = `${source.reference} purchase order.pdf`;
    const confirmed = source.status === WebOrderStatus.CONFIRMED;
    const render = async () =>
      renderPurchaseOrderPdf(
        await documentDataFor(source),
        confirmed ? CONFIRMED_FOOTNOTE : SENT_FOOTNOTE,
      );

    if (source.documentId) {
      const existing = await prisma.document.findUnique({
        where: { id: source.documentId },
        select: { id: true, r2Key: true, originalName: true },
      });
      if (existing && options.redraw) {
        const bytes = await render();
        await putObject(existing.r2Key, bytes, "application/pdf");
        await prisma.document.update({
          where: { id: existing.id },
          data: { sizeBytes: bytes.byteLength },
        });
        return { documentId: existing.id, filename: existing.originalName, bytes };
      }
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

    const bytes = await render();

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
