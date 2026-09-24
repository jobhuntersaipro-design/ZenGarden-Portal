import { prisma } from "@/lib/prisma";
import { previewKind, type DocumentPreviewKind } from "@/lib/validation/buyer-files";

export type BuyerDocumentRow = {
  id: string;
  name: string;
  mimeType: string;
  preview: DocumentPreviewKind;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
};

export type BuyerDocumentFolder = { name: string; documents: BuyerDocumentRow[] };

/**
 * One buyer's documents, a folder at a time: folders A–Z, newest first inside
 * each. The select is narrow on purpose — this table is staff-only and no
 * shop query reads it.
 */
export async function listBuyerDocuments(buyerId: string): Promise<BuyerDocumentFolder[]> {
  const rows = await prisma.buyerDocument.findMany({
    where: { buyerId },
    orderBy: [{ folder: "asc" }, { uploadedAt: "desc" }],
    select: {
      id: true,
      folder: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
      uploadedBy: { select: { name: true } },
    },
  });
  return groupByFolder(
    rows.map((row) => ({
      folder: row.folder,
      id: row.id,
      name: row.originalName,
      mimeType: row.mimeType,
      preview: previewKind(row.mimeType),
      sizeBytes: row.sizeBytes,
      uploadedAt: row.uploadedAt.toISOString(),
      uploadedBy: row.uploadedBy.name,
    })),
  );
}

/** Pure, so the order is tested without a database. */
export function groupByFolder(
  rows: (BuyerDocumentRow & { folder: string })[],
): BuyerDocumentFolder[] {
  const byFolder = new Map<string, BuyerDocumentRow[]>();
  for (const { folder, ...row } of rows) {
    const list = byFolder.get(folder) ?? [];
    list.push(row);
    byFolder.set(folder, list);
  }
  return [...byFolder.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([name, documents]) => ({
      name,
      documents: [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    }));
}

/**
 * Every folder name in use, across all buyers, so the upload form offers
 * "Contracts" to the next buyer as well and the list does not fork on
 * spelling. A folder with no documents left simply stops being offered.
 */
export async function listDocumentFolders(): Promise<string[]> {
  const rows = await prisma.buyerDocument.findMany({
    distinct: ["folder"],
    select: { folder: true },
    orderBy: { folder: "asc" },
  });
  return rows.map((row) => row.folder);
}
