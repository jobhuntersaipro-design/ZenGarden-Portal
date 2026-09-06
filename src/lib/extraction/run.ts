import { Prisma } from "@/generated/prisma/client";
import { ExtractionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { PoExtraction } from "@/lib/extraction/schema";
import type { ExtractionResult } from "@/lib/extraction/extract-po";

export type RunExtractionArgs = {
  extractionId: string;
  documentId: string;
  r2Key: string;
  mimeType: string;
  /** Injected so the runner can be tested without R2 or the Anthropic API. */
  getBytes: (key: string) => Promise<Uint8Array>;
  extract: (bytes: Uint8Array, mimeType: string) => Promise<ExtractionResult>;
};

export type RunExtractionOutcome = {
  status: ExtractionStatus;
  error: string | null;
};

/**
 * The steps shared by `/api/upload/complete` and `retryExtraction`: mark
 * RUNNING, read the bytes, call the model, and write the result. Never throws —
 * a failed extraction is a state the reviewer can act on, not an exception.
 */
export async function runExtraction({
  extractionId,
  documentId,
  r2Key,
  mimeType,
  getBytes,
  extract,
}: RunExtractionArgs): Promise<RunExtractionOutcome> {
  await prisma.extraction.update({
    where: { id: extractionId },
    data: {
      status: ExtractionStatus.RUNNING,
      startedAt: new Date(),
      error: null,
    },
  });

  try {
    const bytes = await getBytes(r2Key);
    const { extraction, model, inputTokens, outputTokens } = await extract(
      bytes,
      mimeType,
    );

    const draft = await toDraft(extraction, extractionId);

    await prisma.$transaction([
      prisma.extraction.update({
        where: { id: extractionId },
        data: {
          status: ExtractionStatus.SUCCEEDED,
          rawJson: extraction as unknown as Prisma.InputJsonValue,
          draftJson: draft as unknown as Prisma.InputJsonValue,
          confidence: Math.round(extraction.confidence.overall),
          model,
          inputTokens,
          outputTokens,
          finishedAt: new Date(),
        },
      }),
      prisma.document.update({
        where: { id: documentId },
        data: { pageCount: extraction.pageCount },
      }),
    ]);

    return { status: ExtractionStatus.SUCCEEDED, error: null };
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "The extraction failed";
    console.error(`[extraction] ${extractionId} failed`, cause);
    await prisma.extraction.update({
      where: { id: extractionId },
      data: {
        status: ExtractionStatus.FAILED,
        error: message,
        finishedAt: new Date(),
      },
    });
    return { status: ExtractionStatus.FAILED, error: message };
  }
}

/**
 * Resolve each line to a catalogue product, or to null.
 *
 * The same rule as the buyer above, for the same reason: **exact matches only**.
 * A SKU printed on the document is the surest key — most buyers quote the
 * supplier's own code — and an exact name is the fallback for documents that
 * print no codes. Anything looser is refused: silently attaching a line to the
 * wrong product misprices an order, and the reviewer cannot see that it
 * happened. `LineItemsTable` shows "Unmatched" and asks.
 *
 * One query for the whole document rather than one per line: a twenty-line PO
 * was twenty round trips.
 */
async function matchProducts(
  lines: PoExtraction["lineItems"],
): Promise<(string | null)[]> {
  const skus = lines.map((line) => line.sku).filter((sku): sku is string => !!sku);
  const names = lines.map((line) => line.description);
  if (skus.length === 0 && names.length === 0) return lines.map(() => null);

  const candidates = await prisma.product.findMany({
    where: {
      // An archived product is not something a new order should be filed
      // against; leaving it unmatched puts the choice in front of a person.
      active: true,
      OR: [
        { sku: { in: skus, mode: "insensitive" } },
        { name: { in: names, mode: "insensitive" } },
      ],
    },
    select: { id: true, sku: true, name: true },
  });

  const key = (value: string) => value.trim().toLowerCase();
  const bySku = new Map(candidates.map((p) => [key(p.sku), p.id]));
  const byName = new Map<string, string | null>();
  for (const product of candidates) {
    const k = key(product.name);
    // Two active products sharing a name cannot be told apart from the
    // document, so neither is chosen.
    byName.set(k, byName.has(k) ? null : product.id);
  }

  return lines.map(
    (line) =>
      (line.sku ? bySku.get(key(line.sku)) : undefined) ??
      byName.get(key(line.description)) ??
      null,
  );
}

/**
 * The model's numbers become Decimal strings here, once, on the way into the
 * draft. From this point on nothing re-parses a float, so a value cannot be
 * rounded twice (docs/specs/04-extraction-review.md §1).
 */
async function toDraft(extraction: PoExtraction, extractionId: string) {
  const money = (value: number) => new Prisma.Decimal(value).toFixed(2);

  // An exact, case-insensitive buyer name match saves the reviewer a step. A
  // near match deliberately does not: picking the wrong buyer silently is
  // worse than making someone choose.
  const matched = await prisma.buyer.findFirst({
    where: { name: { equals: extraction.buyerName, mode: "insensitive" } },
    select: { id: true },
  });

  // Phase 03 stores the buyer the upload came from here; it stands in when the
  // name gives us nothing.
  const existing = await prisma.extraction.findUnique({
    where: { id: extractionId },
    select: { draftJson: true },
  });
  const hinted =
    existing?.draftJson &&
    typeof existing.draftJson === "object" &&
    !Array.isArray(existing.draftJson)
      ? (existing.draftJson as { buyerId?: string }).buyerId
      : undefined;

  // Exactly one of these is set. Carrying both would leave the form showing a
  // chosen buyer while a "create this one" name sat behind it, and only the id
  // would ever be used.
  const buyerId = matched?.id ?? hinted ?? null;

  const products = await matchProducts(extraction.lineItems);

  return {
    poNumber: extraction.poNumber,
    buyerId,
    newBuyerName: buyerId ? null : extraction.buyerName,
    poDate: extraction.poDate,
    deliveryDate: extraction.deliveryDate,
    currency: extraction.currency,
    buyerReference: extraction.buyerReference,
    paymentTerms: extraction.paymentTerms,
    lineItems: extraction.lineItems.map((line, index) => ({
      description: line.description,
      productId: products[index],
      quantity: new Prisma.Decimal(line.quantity).toFixed(3),
      unit: line.unit,
      unitPrice: new Prisma.Decimal(line.unitPrice).toFixed(4),
      amount: money(line.amount),
    })),
    subtotal: money(extraction.subtotal),
    tax: money(extraction.tax),
    total: money(extraction.total),
  };
}
