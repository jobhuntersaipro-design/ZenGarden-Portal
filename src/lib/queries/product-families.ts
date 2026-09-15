import { prisma } from "@/lib/prisma";

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
