import Link from "next/link";
import { formatMYR } from "@/lib/money";
import type { ProductDetail } from "@/lib/queries/product-detail";
import { plural } from "@/lib/plural";
import { FamilyTree } from "@/components/products/FamilyTree";

/**
 * The product this one is a variant of, and its siblings (Phase 36).
 *
 * The figures are the family's over the same twelve months as the tiles
 * above — every variant in every market — so "this fragrance sold 800 of the
 * family's 6,000" is readable from one screen. The siblings are Arc's tree,
 * by market; each opens its own page, and the current one is marked rather
 * than omitted, so the list is the family and not "the others".
 */
export function FamilyCard({
  family,
  currentId,
}: {
  family: NonNullable<ProductDetail["family"]>;
  currentId: string;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-x-md gap-y-xxs">
        <div className="min-w-0">
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Family · <span className="text-ink">{family.code}</span>
          </p>
          <h2 className="mt-xxs truncate font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
            <Link
              href={`/products?family=${family.id}`}
              title={family.name}
              className="hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {family.name}
            </Link>
          </h2>
        </div>
        <p className="text-[length:var(--text-caption)] text-ink-tertiary tabular-nums">
          {plural(family.siblings.length, "variant")} ·{" "}
          {Math.round(family.units).toLocaleString("en-MY")} sold ·{" "}
          {plural(family.orders, "order")} · {formatMYR(family.revenue.toFixed(2))} in 12 months
        </p>
      </div>

      <div className="mt-sm">
        <FamilyTree siblings={family.siblings} currentId={currentId} />
      </div>
    </section>
  );
}
