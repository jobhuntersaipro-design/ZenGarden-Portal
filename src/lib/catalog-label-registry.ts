import type { Prisma } from "@/generated/prisma/client";
import type { CatalogLabelKind } from "@/generated/prisma/enums";
import { FIELD_KIND, type LabelField } from "@/lib/catalog-labels";

/**
 * Anything that can write the vocabulary: the client itself or an open
 * transaction. Structural, the way `AuditWriter` is, so the call reads
 * identically inside and outside a `$transaction`.
 */
export type LabelWriter = {
  catalogLabel: Pick<Prisma.TransactionClient["catalogLabel"], "findFirst" | "create">;
};

/**
 * Puts whatever a product was just given into the catalogue's vocabulary.
 *
 * The pickers let a super admin add a value by typing it, and that value has
 * to survive the product it was typed on — otherwise deleting that product
 * would silently take the brand with it, which is exactly the disappearing
 * act `CatalogLabel` exists to end. Called from `createProduct` and
 * `updateProduct` inside their own transaction, so a product and its
 * vocabulary land together or not at all.
 *
 * Matching is case-insensitive: "mydin" typed where "Mydin" is on record
 * registers nothing, because a list holding both is the fragmentation these
 * pickers exist to avoid.
 */
export async function registerLabels(
  tx: LabelWriter,
  values: Partial<Record<LabelField, string | null>>,
): Promise<void> {
  for (const [field, value] of Object.entries(values) as [
    LabelField,
    string | null | undefined,
  ][]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const kind: CatalogLabelKind = FIELD_KIND[field];
    const existing = await tx.catalogLabel.findFirst({
      where: { kind, value: { equals: trimmed, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) continue;
    await tx.catalogLabel.create({ data: { kind, value: trimmed } });
  }
}
