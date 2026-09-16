import Link from "next/link";
import { formatMYR } from "@/lib/money";
import type { ProductDetail } from "@/lib/queries/product-detail";

/**
 * The product this one is a variant of, and its siblings (Phase 36).
 *
 * The figures are the family's over the same twelve months as the tiles
 * above — every variant in every market — so "this fragrance sold 800 of the
 * family's 6,000" is readable from one screen. Each sibling links to its own
 * page; the current one is marked rather than omitted, so the list is the
 * family and not "the others".
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
          {family.siblings.length} {family.siblings.length === 1 ? "variant" : "variants"} ·{" "}
          {Math.round(family.units).toLocaleString("en-MY")} sold ·{" "}
          {family.orders} orders · {formatMYR(family.revenue.toFixed(2))} in 12 months
        </p>
      </div>

      <ul className="mt-sm flex flex-wrap gap-xs">
        {family.siblings.map((sibling) => {
          const current = sibling.id === currentId;
          const text = [sibling.variant ?? "Standard", sibling.market]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={sibling.id}>
              <Link
                href={`/products/${sibling.id}`}
                aria-current={current ? "page" : undefined}
                title={`${sibling.name} · ${sibling.sku}`}
                className={`inline-flex min-h-control-md items-center gap-xs rounded-pill border px-sm text-[length:var(--text-body-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-control-sm ${
                  current
                    ? "border-ink bg-ink text-canvas"
                    : "border-hairline-strong text-ink hover:bg-surface"
                } ${sibling.active ? "" : "opacity-60"}`}
              >
                <span>{text}</span>
                <span
                  className={`font-mono text-[length:var(--text-caption)] ${current ? "text-canvas/70" : "text-ink-tertiary"}`}
                >
                  {sibling.sku}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
