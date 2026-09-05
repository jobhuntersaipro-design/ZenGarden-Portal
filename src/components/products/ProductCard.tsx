import Link from "next/link";
import { ProductThumb } from "@/components/products/ProductThumb";
import type { ProductRow } from "@/lib/queries/products";
import { formatMYR } from "@/lib/money";

/** The one flag worth surfacing on a card, most serious first. */
function flagFor(product: ProductRow) {
  if (!product.active) return { label: "Inactive", tone: "text-ink-tertiary" };
  if (product.flags.includes("missing-image")) {
    return { label: "No image", tone: "text-brand-amber" };
  }
  if (product.flags.includes("not-sold-60d")) {
    return { label: "Not sold 60d", tone: "text-brand-amber" };
  }
  return null;
}

export function ProductCard({
  product,
  imageUrl,
}: {
  product: ProductRow;
  imageUrl: string | null;
}) {
  const flag = flagFor(product);

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-hairline bg-canvas transition-all hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="relative aspect-4/3 bg-surface-soft">
        <ProductThumb name={product.name} url={imageUrl} />
        <span className="absolute left-xs top-xs rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-ink-secondary">
          {product.category}
        </span>
        {flag ? (
          <span
            className={`absolute right-xs top-xs rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] ${flag.tone}`}
          >
            {flag.label}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-xxs p-md">
        <p
          title={product.name}
          className="line-clamp-2 text-[length:var(--text-body-sm)] font-medium text-ink"
        >
          {product.name}
        </p>
        <p className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">
          {product.sku} · per {product.unit}
        </p>
        <p className="mt-auto flex items-baseline gap-xs">
          <span className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink tabular-nums">
            {formatMYR(product.listPrice.toFixed(2))}
          </span>
          {product.stats.driftPercent === null ? null : (
            <span
              className={`tabular-nums text-[length:var(--text-caption)] ${
                product.stats.driftPercent >= 0 ? "text-accent-green" : "text-accent-red"
              }`}
            >
              {product.stats.driftPercent >= 0 ? "+" : ""}
              {product.stats.driftPercent.toFixed(1)}%
            </span>
          )}
        </p>
      </div>

      <p className="border-t border-hairline px-md py-xs text-[length:var(--text-caption)] text-ink-tertiary tabular-nums">
        {Math.round(product.stats.units).toLocaleString("en-MY")} sold ·{" "}
        {product.stats.buyers} buyers · {formatMYR(product.stats.revenue.toFixed(2))}
      </p>
    </Link>
  );
}
