import Link from "next/link";
import { ProductThumb } from "@/components/products/ProductThumb";
import { AddToOrder } from "@/components/shop/AddToOrder";
import { unitLabel } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import { shopHref } from "@/lib/shop-routes";
import type { ShopProduct } from "@/lib/queries/shop-catalogue";

export function ShopProductCard({ product }: { product: ShopProduct }) {
  const subtitle = [product.brand, product.variant].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-col rounded-lg border border-hairline bg-canvas p-md">
      <Link
        href={shopHref.product(product.id)}
        className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <div className="aspect-square overflow-hidden rounded-md bg-surface-soft">
          <ProductThumb name={product.name} url={product.imageUrl} />
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
        {unitLabel(product.packSize, product.unit)}
      </p>
      <p className="mt-xs text-[length:var(--text-body-md)] font-semibold tabular-nums text-ink">
        {formatMYR(Number(product.listPrice))}
        <span className="ml-xxs text-[length:var(--text-caption)] font-normal text-ink-tertiary">
          {`per ${product.unit}`}
        </span>
      </p>
      <div className="mt-auto pt-sm">
        <AddToOrder
          productId={product.id}
          name={product.name}
          packSize={product.packSize}
          unit={product.unit}
        />
      </div>
    </li>
  );
}
