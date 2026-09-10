import { notFound } from "next/navigation";
import Link from "next/link";
import { Prisma } from "@/generated/prisma/browser";
import { BuyBox } from "@/components/shop/BuyBox";
import { ProductGallery } from "@/components/products/ProductGallery";
import { ProductSpecs } from "@/components/shop/ProductSpecs";
import { ShopProductCard } from "@/components/shop/ShopProductCard";
import { unitLabel } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import { loadShopProduct, relatedShopProducts } from "@/lib/queries/shop-catalogue";
import { shopHref } from "@/lib/shop-routes";

export const dynamic = "force-dynamic";

export default async function ShopProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const product = await loadShopProduct(id);
  // loadShopProduct applies SHOP_VISIBLE, so a product that is not on offer
  // — archived, needsReview, or unpriced — 404s here rather than showing a
  // price nobody can order at.
  if (!product) notFound();

  const related = await relatedShopProducts(product);

  const perPieceLabel =
    product.packSize === null
      ? null
      : `${formatMYR(new Prisma.Decimal(product.listPrice).dividedBy(product.packSize))} a piece · ${unitLabel(product.packSize, product.unit)}`;

  return (
    <div className="pt-lg">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-xs text-[length:var(--text-caption)] text-ink-tertiary"
      >
        <Link
          href={shopHref.home()}
          className="text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Home
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={shopHref.catalogue({ category: product.category })}
          className="text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {product.category}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="mt-md grid gap-xl lg:grid-cols-[5fr_7fr]">
        <div className="self-start">
          <ProductGallery
            images={product.imageUrls.map((url, index) => ({
              id: `${product.id}-${index}`,
              url,
              position: index,
            }))}
            productName={product.name}
            canEdit={false}
          />
        </div>

        <div>
          {product.brand ? (
            <p className="font-mono text-[length:var(--text-eyebrow)] uppercase text-ink-tertiary">
              {product.brand}
            </p>
          ) : null}
          <h1
            className={`font-display text-[length:var(--text-display-md)] font-[650] text-ink ${product.brand ? "mt-xs" : ""}`}
          >
            {product.name}
          </h1>
          <div className="mt-sm flex flex-wrap items-center gap-sm text-[length:var(--text-caption)] text-ink-tertiary">
            <span className="font-mono">{product.sku}</span>
            <span aria-hidden className="h-3 w-px bg-hairline-strong" />
            <span>{product.category}</span>
            {product.market ? (
              <>
                <span aria-hidden className="h-3 w-px bg-hairline-strong" />
                <span>{product.market}</span>
              </>
            ) : null}
          </div>

          <div className="mt-lg">
            <BuyBox
              productId={product.id}
              name={product.name}
              unit={product.unit}
              packSize={product.packSize}
              listPrice={product.listPrice}
              perPieceLabel={perPieceLabel}
            />
          </div>

          <div className="mt-lg">
            <ProductSpecs product={product} />
          </div>
        </div>
      </div>

      {product.description ? (
        <div className="mt-xl">
          <h2 className="text-[length:var(--text-heading-sm)] font-[650] text-ink">
            About this product
          </h2>
          <p className="mt-sm max-w-[65ch] text-[length:var(--text-body-md)] text-ink-secondary">
            {product.description}
          </p>
        </div>
      ) : null}

      {related.length > 0 ? (
        <div className="mt-xl">
          <h2 className="text-[length:var(--text-heading-md)] font-[650] text-ink">
            {product.brand ? `More from ${product.brand}` : "You may also like"}
          </h2>
          <ul className="mt-md grid grid-cols-2 gap-md lg:grid-cols-4">
            {related.map((relatedProduct) => (
              <ShopProductCard key={relatedProduct.id} product={relatedProduct} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
