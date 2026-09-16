import { prisma } from "@/lib/prisma";
import { deleteObject, isPendingKey } from "@/lib/r2";

/** A Document with no Extraction after this long was an abandoned upload. */
const ORPHAN_AGE_MS = 60 * 60_000;
/** Swept on 1 presign call in 20, rather than by a scheduler we would have to own. */
const CLEANUP_ODDS = 20;
/** A single sweep stays small so it never delays the presign it rides on. */
const CLEANUP_BATCH = 25;

/**
 * A row is created before the browser uploads, so a tab closed mid-upload
 * leaves a Document with no bytes behind it and no Extraction ever. Both the
 * row and any object that did land are removed here.
 *
 * **`webOrder: null` is load-bearing, and was added in the same commit as the
 * migration that made it possible to be false.** Since Phase 37 a third kind
 * of document exists: the purchase order generated for a shop order, which has
 * no extraction and no purchase order of its own until the ops team confirms
 * it — days later. Without this clause every one of them is swept an hour
 * after it is written, the buyer's Download PDF 404s, and nothing says so:
 * this runs on one presign in twenty and logs a count nobody reads.
 */
export async function deleteOrphans(): Promise<number> {
  const orphans = await prisma.document.findMany({
    where: {
      extraction: null,
      purchaseOrder: null,
      webOrder: null,
      uploadedAt: { lt: new Date(Date.now() - ORPHAN_AGE_MS) },
    },
    select: { id: true, r2Key: true },
    take: CLEANUP_BATCH,
  });
  if (orphans.length === 0) return 0;

  for (const orphan of orphans) {
    // A row that never got past the placeholder key names no object at all.
    if (isPendingKey(orphan.r2Key)) continue;
    // The object may never have been written; a delete on a missing key is not
    // an error worth failing the sweep over.
    try {
      await deleteObject(orphan.r2Key);
    } catch (cause) {
      console.error(`[documents] could not delete ${orphan.r2Key}`, cause);
    }
  }

  const { count } = await prisma.document.deleteMany({
    where: { id: { in: orphans.map((orphan) => orphan.id) } },
  });
  return count;
}

/** Never throws and never blocks the caller's own work. */
export async function maybeDeleteOrphans(): Promise<void> {
  if (Math.random() * CLEANUP_ODDS >= 1) return;
  try {
    const count = await deleteOrphans();
    if (count > 0) console.info(`[documents] swept ${count} orphaned uploads`);
  } catch (cause) {
    console.error("[documents] orphan sweep failed", cause);
  }
}

/**
 * Ownership is checked by querying for it rather than by reading the row and
 * comparing afterwards, so there is no path where a caller sees another user's
 * document at all.
 */
export function findOwnedDocument(documentId: string, userId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, uploadedById: userId },
    select: {
      id: true,
      r2Key: true,
      mimeType: true,
      sizeBytes: true,
      originalName: true,
      extraction: { select: { id: true } },
    },
  });
}

/**
 * A document a *buyer* may read: the purchase order generated for one of
 * their own shop orders, and nothing else (Phase 37).
 *
 * Scoped through `webOrder.buyerId` rather than `uploadedById`, because the
 * uploader on a generated file is the contact who placed the order and a
 * buyer's colleague must be able to read it too. **A scan the ops team
 * uploaded can never match this `where`**, whatever id is guessed: it has no
 * `webOrder`. That is the deliberate difference from `/api/documents/[id]/url`,
 * which is ops-wide and unscoped by buyer — the hazard Phase 35 recorded and
 * declined to expose.
 */
export function findClientDocument(buyerId: string, documentId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, webOrder: { buyerId } },
    select: { id: true, r2Key: true, mimeType: true, originalName: true },
  });
}
