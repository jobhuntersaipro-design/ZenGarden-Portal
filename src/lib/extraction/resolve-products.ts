import { prisma } from "@/lib/prisma";
import { normaliseSku } from "@/lib/validation/products";

/** What a line needs to carry to be resolved. Money stays a string throughout. */
export type ResolvableLine = {
  description: string;
  sku: string | null;
  unit: string | null;
  unitPrice: string;
};

const key = (value: string) => normaliseSku(value);

/**
 * A product code is the only identity a line has.
 *
 * Matching is exact and case-insensitive, never fuzzy — that rule is from the
 * 2026-09-06 matching work and still holds: silently attaching a line to the
 * wrong product misprices an order and the reviewer cannot see it happened.
 *
 * What changed is the miss case. A code the catalogue has never seen now
 * *creates* a product rather than leaving the line unmatched, so nobody
 * hand-picks twenty products on a twenty-line order, and a genuinely new
 * product reaches the catalogue the first time it is ordered.
 *
 * Description matching is deliberately gone. Two active products can share a
 * name, and with auto-create the old fallback would attach a line to the wrong
 * product *and* skip creating the right one.
 *
 * Cost is bounded per document — one read, at most one write, at most one
 * re-read — never one query per line.
 */
export async function resolveProducts(
  lines: ResolvableLine[],
): Promise<(string | null)[]> {
  if (lines.length === 0) return [];

  // Normalised on the way in as well as on the way out: a product created here
  // must be one the edit form can save, and the lookup must find it again.
  const codes = lines
    .map((line) => (line.sku ? normaliseSku(line.sku) : ""))
    .filter((sku): sku is string => Boolean(sku));
  if (codes.length === 0) return lines.map(() => null);

  // An archived product is not something a new order should be filed against,
  // so it does not match; the code creates a fresh active row instead.
  const existing = await prisma.product.findMany({
    where: { active: true, sku: { in: codes, mode: "insensitive" } },
    select: { id: true, sku: true },
  });

  const byCode = new Map(existing.map((p) => [key(p.sku), p.id]));

  // De-duplicated before any write, so two lines sharing a new code create one
  // product rather than racing each other.
  const missing = new Map<string, ResolvableLine>();
  for (const line of lines) {
    const code = line.sku ? normaliseSku(line.sku) : "";
    if (!code || byCode.has(code)) continue;
    if (!missing.has(code)) missing.set(code, line);
  }

  if (missing.size > 0) {
    const created = await prisma.product.createManyAndReturn({
      // Another upload may be creating the same code right now; `sku` is
      // unique, so a duplicate is skipped here and re-read below rather than
      // failing the whole extraction.
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

    const stillMissing = [...missing.keys()].filter((k) => !byCode.has(k));
    if (stillMissing.length > 0) {
      const raced = await prisma.product.findMany({
        where: { sku: { in: stillMissing, mode: "insensitive" } },
        select: { id: true, sku: true },
      });
      for (const product of raced) byCode.set(key(product.sku), product.id);
    }
  }

  return lines.map((line) => {
    const code = line.sku ? normaliseSku(line.sku) : "";
    return code ? (byCode.get(code) ?? null) : null;
  });
}
