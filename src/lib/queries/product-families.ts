import { prisma } from "@/lib/prisma";
import type { ListingCandidate } from "@/lib/listings";
import type { Prisma } from "@/generated/prisma/client";

export type ListingMember = {
  id: string;
  sku: string;
  name: string;
  variant: string | null;
  packSize: number | null;
  unit: string;
  market: string | null;
  listPrice: string;
  active: boolean;
};

export type Listing = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  category: string;
  size: string | null;
  markets: { market: string | null; members: ListingMember[] }[];
};

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

/**
 * One listing as the admin manages it: the family's own facts, and its
 * products grouped by market — because a family in two markets is two
 * listings on the shop, and the page has to show them as the buyer sees
 * them rather than as one undifferentiated list.
 *
 * Archived products are included. This is the screen where a hidden variant
 * is made visible again, so hiding one must not remove it from view.
 */
export async function loadListing(id: string): Promise<Listing | null> {
  const family = await prisma.productFamily.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      brand: true,
      category: true,
      size: true,
      products: {
        select: {
          id: true,
          sku: true,
          name: true,
          variant: true,
          packSize: true,
          unit: true,
          market: true,
          listPrice: true,
          active: true,
        },
        orderBy: [{ market: "asc" }, { variant: "asc" }, { sku: "asc" }],
      },
    },
  });
  if (!family) return null;

  const byMarket = new Map<string, { market: string | null; members: ListingMember[] }>();
  for (const product of family.products) {
    const key = product.market ?? "";
    let section = byMarket.get(key);
    if (!section) {
      section = { market: product.market, members: [] };
      byMarket.set(key, section);
    }
    section.members.push({ ...product, listPrice: product.listPrice.toFixed(2) });
  }

  const { products: _products, ...facts } = family;
  void _products;
  return { ...facts, markets: [...byMarket.values()] };
}

/** Candidates for "add a product": everything not already in this family. */
export async function productsOutsideFamily(familyId: string) {
  return prisma.product.findMany({
    where: { NOT: { familyId } },
    select: { id: true, sku: true, name: true, brand: true, variant: true, market: true },
    orderBy: { sku: "asc" },
    take: 500,
  });
}
