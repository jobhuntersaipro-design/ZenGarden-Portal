import Link from "next/link";
import { ShopProductCard } from "@/components/shop/ShopProductCard";
import { shopHref } from "@/lib/shop-routes";
import type { ShopProduct } from "@/lib/queries/shop-catalogue";

export function BestSellers({ products }: { products: ShopProduct[] }) {
  if (products.length === 0) return null;

  return (
    <section>
      <div className="mb-md flex items-baseline justify-between gap-md">
        <h2 className="text-[length:var(--text-heading-md)] font-[650] text-ink">
          Best sellers
        </h2>
        <Link
          href={shopHref.catalogue()}
          className="shrink-0 rounded-sm text-[length:var(--text-body-sm)] font-medium text-brand-link hover:text-brand-pink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          See all →
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-md lg:grid-cols-4">
        {products.map((product, index) => (
          <ShopProductCard
            key={product.id}
            product={product}
            badge={index === 0 ? "Best seller" : undefined}
          />
        ))}
      </ul>
    </section>
  );
}
