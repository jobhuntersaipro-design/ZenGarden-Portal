import { prisma } from "@/lib/prisma";
import { previewKind, type DocumentPreviewKind } from "@/lib/validation/buyer-files";

export type PurchaseOrderDocumentRow = {
  id: string;
  name: string;
  mimeType: string;
  preview: DocumentPreviewKind;
  sizeBytes: number;
  category: string;
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
      category: true,
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
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    uploadedBy: row.uploadedBy.name || row.uploadedByName,
  }));
}
