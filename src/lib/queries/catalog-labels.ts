import { CatalogLabelKind } from "@/generated/prisma/enums";
import { LABEL_FIELD, LABEL_KINDS } from "@/lib/catalog-labels";
import { prisma } from "@/lib/prisma";

export type LabelRow = {
  id: string;
  kind: CatalogLabelKind;
  value: string;
  /** How many products carry it — what makes Remove safe or refused. */
  products: number;
};

/**
 * Every value in the catalogue's vocabulary, with its usage.
 *
 * Five queries, not one per value: the labels themselves, then one `groupBy`
 * per kind over `Product`. Counting per row would be 120-odd queries on the
 * real catalogue, which is the shape of N+1 this screen would otherwise have.
 */
export async function listCatalogLabels(): Promise<Record<CatalogLabelKind, LabelRow[]>> {
  const [labels, ...groups] = await Promise.all([
    prisma.catalogLabel.findMany({ orderBy: [{ kind: "asc" }, { value: "asc" }] }),
    ...LABEL_KINDS.map((kind) =>
      prisma.product.groupBy({
        by: [LABEL_FIELD[kind]],
        // `_count: true` gives a plain number per group; `{ _all: true }`
        // would give an object and quietly read as NaN below.
        _count: true,
      }),
    ),
  ]);

  const counts = new Map<string, number>();
  LABEL_KINDS.forEach((kind, index) => {
    const field = LABEL_FIELD[kind];
    for (const row of groups[index] as Array<Record<string, unknown>>) {
      const value = row[field];
      if (typeof value !== "string") continue;
      // Keyed case-insensitively: a product written by a script can carry
      // "hair care" where the vocabulary says "Hair care", and a row that
      // claimed zero products would offer a Remove the action then refuses.
      counts.set(`${kind}:${value.toLowerCase()}`, Number(row._count ?? 0));
    }
  });

  const byKind = Object.fromEntries(
    LABEL_KINDS.map((kind) => [kind, [] as LabelRow[]]),
  ) as Record<CatalogLabelKind, LabelRow[]>;

  for (const label of labels) {
    byKind[label.kind].push({
      id: label.id,
      kind: label.kind,
      value: label.value,
      products: counts.get(`${label.kind}:${label.value.toLowerCase()}`) ?? 0,
    });
  }

  return byKind;
}

/** How many products carry one value — the check `removeLabel` re-runs. */
export async function countProductsWithLabel(
  kind: CatalogLabelKind,
  value: string,
): Promise<number> {
  return prisma.product.count({
    where: { [LABEL_FIELD[kind]]: { equals: value, mode: "insensitive" } },
  });
}
