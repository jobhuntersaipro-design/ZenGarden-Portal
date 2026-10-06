import { prisma } from "@/lib/prisma";
import { previewKind, type DocumentPreviewKind } from "@/lib/validation/buyer-files";

/**
 * The order belongs to this buyer. Shop reads use this and nothing wider:
 * `BuyerDocument` is the account file list and stays staff-only.
 */
const ownedByBuyer = (buyerId: string, purchaseOrderId: string) => ({
  purchaseOrderId,
  purchaseOrder: { buyerId },
});

export type PurchaseOrderDocumentRow = {
  id: string;
  name: string;
  mimeType: string;
  preview: DocumentPreviewKind;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: string;
};

/**
 * One order's documents, newest first. The select is the list the page draws
 * and nothing else — the storage key stays on the server.
 */
export async function listPurchaseOrderDocuments(
  purchaseOrderId: string,
): Promise<PurchaseOrderDocumentRow[]> {
  const rows = await prisma.purchaseOrderDocument.findMany({
    where: { purchaseOrderId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      uploadedByName: true,
      uploadedBy: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.originalName,
    mimeType: row.mimeType,
    preview: previewKind(row.mimeType),
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    uploadedBy: row.uploadedBy.name || row.uploadedByName,
  }));
}

/** What a buyer may see of a file on their order. No storage key, no staff name. */
export type BuyerOrderDocumentRow = {
  id: string;
  name: string;
  mimeType: string;
  preview: DocumentPreviewKind;
  createdAt: string;
};

const BUYER_ORDER_DOCUMENT_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  createdAt: true,
} as const;

/**
 * Files on one purchase order, for the buyer who owns that order. An id that
 * is not theirs returns nothing — the same answer as an order with no files.
 * Never reads `BuyerDocument`.
 */
export async function listBuyerOrderDocuments(
  buyerId: string,
  purchaseOrderId: string,
): Promise<BuyerOrderDocumentRow[]> {
  const rows = await prisma.purchaseOrderDocument.findMany({
    where: ownedByBuyer(buyerId, purchaseOrderId),
    orderBy: { createdAt: "desc" },
    select: BUYER_ORDER_DOCUMENT_SELECT,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.originalName,
    mimeType: row.mimeType,
    preview: previewKind(row.mimeType),
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * One file, only if it hangs off this buyer's purchase order. Used by the
 * shop URL route. A miss is null, which the route answers as 404.
 */
export async function findBuyerOrderDocument(
  buyerId: string,
  purchaseOrderId: string,
  documentId: string,
) {
  return prisma.purchaseOrderDocument.findFirst({
    where: { id: documentId, ...ownedByBuyer(buyerId, purchaseOrderId) },
    select: { r2Key: true, mimeType: true, originalName: true },
  });
}
