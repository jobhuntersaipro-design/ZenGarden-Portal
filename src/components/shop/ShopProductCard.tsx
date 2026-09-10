import Link from "next/link";
import { AddToCart } from "@/components/shop/AddToCart";
import { ProductThumb } from "@/components/products/ProductThumb";
import { unitLabel } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import { shopHref } from "@/lib/shop-routes";
import type { ShopProduct } from "@/lib/queries/shop-catalogue";

export function ShopProductCard({
  product,
  badge,
}: {
  product: ShopProduct;
  /** e.g. "Best seller" — a pill over the top-left of the image well. */
  badge?: string;
}) {
  const subtitle = [product.brand, product.variant].filter(Boolean).join(" · ");
  // "12 per carton · Malaysia" — the pack half is always there; the market
  // half only when the catalogue actually names one.
  const packCaption = [unitLabel(product.packSize, product.unit), product.market]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-col rounded-lg border border-hairline bg-canvas p-md transition-colors hover:border-hairline-strong hover:shadow-sm">
      <Link
        href={shopHref.product(product.id)}
        className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <div className="relative aspect-square overflow-hidden rounded-md bg-surface-soft">
          <ProductThumb name={product.name} url={product.imageUrl} />
          {badge ? (
            <span className="absolute top-xs left-xs rounded-pill bg-ink px-xs py-xxs text-[length:var(--text-caption)] font-semibold text-canvas">
              {badge}
            </span>
          ) : null}
        </div>
        <h3
          className="mt-xs text-[length:var(--text-body-sm)] font-semibold text-ink"
          title={product.name}
        >
          {product.name}
        </h3>
      </Link>
      {subtitle ? (
        <p className="text-[length:var(--text-caption)] text-ink-tertiary" title={subtitle}>
          {subtitle}
        </p>
      ) : null}
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
        {packCaption}
      </p>
      <p className="mt-xs text-[length:var(--text-body-md)] font-semibold tabular-nums text-ink">
        {formatMYR(Number(product.listPrice))}
        <span className="ml-xxs text-[length:var(--text-caption)] font-normal text-ink-tertiary">
          {`per ${product.unit}`}
        </span>
      </p>
      <div className="mt-auto pt-sm">
        <AddToCart
          productId={product.id}
          name={product.name}
          packSize={product.packSize}
          unit={product.unit}
          variant="card"
        />
      </div>
    </li>
  );
}
