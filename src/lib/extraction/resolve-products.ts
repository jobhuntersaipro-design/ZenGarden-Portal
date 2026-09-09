import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normaliseSku } from "@/lib/validation/products";

export type ResolvableLine = {
  description: string;
  sku: string | null;
  unit: string | null;
  unitPrice: string;
};

const key = (value: string) => normaliseSku(value);

/**
 * What a printed code conclusively points at, and nothing more.
 *
 * Matching is exact and case-insensitive, never fuzzy — that rule is from the
 * 2026-09-06 matching work and still holds: silently attaching a line to the
 * wrong product misprices an order and the reviewer cannot see it happened.
 *
 * Since Phase 12 this **writes nothing**. A code the catalogue has never seen
 * returns null and the reviewer decides on the review screen, where ranked
 * suggestions are computed against the live catalogue. Creating products here
 * meant a draft that was never confirmed still grew the catalogue.
 *
 * One query for the whole document, never one per line.
 */
export async function suggestProducts(
  lines: ResolvableLine[],
): Promise<(string | null)[]> {
  const codes = lines
    .map((line) => (line.sku ? normaliseSku(line.sku) : ""))
    .filter((sku): sku is string => Boolean(sku));
  if (codes.length === 0) return lines.map(() => null);

  // An archived product is not something a new order should be filed against.
  const existing = await prisma.product.findMany({
    where: { active: true, sku: { in: codes, mode: "insensitive" } },
    select: { id: true, sku: true },
  });
  const byCode = new Map(existing.map((product) => [key(product.sku), product.id]));

  return lines.map((line) => {
    const code = line.sku ? normaliseSku(line.sku) : "";
    return code ? (byCode.get(code) ?? null) : null;
  });
}

/**
 * Products for the lines the reviewer marked "create a new one", written
 * inside `confirmPurchaseOrder`'s transaction so a discarded draft creates
 * nothing. Returns ids positionally, null where a line carried no code.
 *
 * Cost is bounded: at most one write and at most one re-read for the whole
 * document, never one query per line.
 */
export async function createProductsForLines(
  tx: Prisma.TransactionClient,
  lines: ResolvableLine[],
): Promise<(string | null)[]> {
  const byCode = new Map<string, string>();

  // De-duplicated before any write, so two lines sharing a new code create
  // one product rather than racing each other.
  const missing = new Map<string, ResolvableLine>();
  for (const line of lines) {
    const code = line.sku ? normaliseSku(line.sku) : "";
    if (!code || missing.has(code)) continue;
    missing.set(code, line);
  }
  if (missing.size === 0) return lines.map(() => null);

  const created = await tx.product.createManyAndReturn({
    // Another confirm may be creating the same code right now; `sku` is
    // unique, so a duplicate is skipped here and re-read below rather than
    // failing the whole confirm.
    skipDuplicates: true,
    data: [...missing.values()].map((line) => ({
      sku: normaliseSku(line.sku!),
      name: line.description.trim(),
      // Product.unit is required and a document does not always print one.
      unit: line.unit?.trim() || "unit",
      listPrice: line.unitPrice,
      // A real member of PRODUCT_CATEGORIES, never free text.
      category: "Uncategorised",
      active: true,
      needsReview: true,
    })),
    select: { id: true, sku: true },
  });
  for (const product of created) byCode.set(key(product.sku), product.id);

  const stillMissing = [...missing.keys()].filter((code) => !byCode.has(code));
  if (stillMissing.length > 0) {
    const raced = await tx.product.findMany({
      where: { sku: { in: stillMissing, mode: "insensitive" } },
      select: { id: true, sku: true },
    });
    for (const product of raced) byCode.set(key(product.sku), product.id);
  }

  return lines.map((line) => {
    const code = line.sku ? normaliseSku(line.sku) : "";
    return code ? (byCode.get(code) ?? null) : null;
  });
}
