import { prisma } from "@/lib/prisma";
import type { ListingCandidate } from "@/lib/listings";
import type { Prisma } from "@/generated/prisma/client";

export type FamilyOption = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  category: string;
  size: string | null;
  /** How many products are in it — what makes Remove safe or refused. */
  products: number;
};

/**
 * Every family, with its product count: the picker on the create form and
 * the edit drawer, and the admin section. Two queries, not one per family.
 */
export async function listFamilies(): Promise<FamilyOption[]> {
  const [families, counts] = await Promise.all([
    prisma.productFamily.findMany({
      select: { id: true, code: true, name: true, brand: true, category: true, size: true },
      orderBy: { code: "asc" },
    }),
    prisma.product.groupBy({ by: ["familyId"], _count: true }),
  ]);
  const byFamily = new Map<string, number>();
  for (const row of counts) {
    if (row.familyId) byFamily.set(row.familyId, Number(row._count ?? 0));
  }
  return families.map((family) => ({
    ...family,
    products: byFamily.get(family.id) ?? 0,
  }));
}

/**
 * The products a listing lookup has to consider: same brand, same market.
 *
 * Narrowed in the database on the two fields that are exact, and left to
 * `resolveListing` to compare the third — the name, which needs
 * `groupName`'s variant-suffix rule and cannot be expressed in a `where`.
 *
 * Ordered by family name — a list shown to someone should not be ordered by
 * whatever the database happened to return — even though only the
 * `ambiguous` branch, which reads the ones that have a family, is ever shown
 * to a person; products with no family sort together, which is fine, since
 * that branch never reads them.
 *
 * Takes the client to read through, so a write can run the same lookup
 * inside its own transaction and see its own uncommitted rows.
 */
export async function listingCandidates(
  input: { brand: string | null; market: string | null },
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ListingCandidate[]> {
  const rows = await client.product.findMany({
    where: { brand: input.brand, market: input.market },
    orderBy: { family: { name: "asc" } },
    select: {
      id: true,
      brand: true,
      name: true,
      variant: true,
      market: true,
      familyId: true,
      family: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    brand: row.brand,
    name: row.name,
    variant: row.variant,
    market: row.market,
    familyId: row.familyId,
    familyName: row.family?.name ?? null,
  }));
}
