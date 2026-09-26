import type { Metadata } from "next";
import { CatalogLabelSection } from "@/components/admin/CatalogLabelSection";
import { ProductFamilySection } from "@/components/admin/ProductFamilySection";
import { Rise } from "@/components/portal/Rise";
import { LABEL_KINDS } from "@/lib/catalog-labels";
import { listCatalogLabels } from "@/lib/queries/catalog-labels";
import { listFamilies } from "@/lib/queries/product-families";
import { withLoadingFloor } from "@/lib/loading-floor";

export const metadata: Metadata = { title: "Catalogue · Zen Garden Portal" };
export const dynamic = "force-dynamic";

/**
 * The vocabulary every product is described with.
 *
 * Until Phase 28 these four lists were whatever the products happened to say,
 * so a value could be added only by typing it into a product and could never
 * be corrected or cleared. They are rows now, and this is where they are kept.
 */
async function AdminCataloguePage() {
  const [labels, families] = await Promise.all([listCatalogLabels(), listFamilies()]);
  const total = LABEL_KINDS.reduce((sum, kind) => sum + labels[kind].length, 0);

  return (
    <>
      <Rise index={0} className="mb-lg">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Vocabulary
        </p>
        <h1 className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
          Catalogue
        </h1>
        <p className="mt-xxs max-w-[62ch] text-[length:var(--text-body-sm)] text-ink-secondary">
          {total} {total === 1 ? "value" : "values"} across brand, variant, market and
          category, and {families.length} product{" "}
          {families.length === 1 ? "family" : "families"}. Renaming one here renames
          it on every product that carries it.
        </p>
      </Rise>

      <div className="grid gap-lg lg:grid-cols-2">
        {LABEL_KINDS.map((kind, index) => (
          <Rise key={kind} index={index + 1} className="min-w-0">
            <CatalogLabelSection kind={kind} rows={labels[kind]} />
          </Rise>
        ))}
        {/* Full width: a family row carries a code, a name, a size and a
            count, which is more than half a column holds. */}
        <Rise index={LABEL_KINDS.length + 1} className="min-w-0 lg:col-span-2">
          <ProductFamilySection rows={families} />
        </Rise>
      </div>
    </>
  );
}

export default withLoadingFloor(AdminCataloguePage);
