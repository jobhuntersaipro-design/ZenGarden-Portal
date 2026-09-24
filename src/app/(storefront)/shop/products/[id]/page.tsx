import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Prisma } from "@/generated/prisma/browser";
import { BuyBox } from "@/components/shop/BuyBox";
import { ProductGallery } from "@/components/products/ProductGallery";
import { ProductSpecs } from "@/components/shop/ProductSpecs";
import { ShopProductCard } from "@/components/shop/ShopProductCard";
import { unitLabel } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import { VariantPicker } from "@/components/shop/VariantPicker";
import {
  loadShopProduct,
  relatedShopProducts,
  singleGroup,
  variantsOfProduct,
} from "@/lib/queries/shop-catalogue";
import { shopHref } from "@/lib/shop-routes";
import { loadShopAudience } from "@/lib/shop-viewer";

export const dynamic = "force-dynamic";

/**
 * The product's own name in the tab (2026-09-24), resolved through the same
 * audience and market predicate as the page: a product outside the buyer's
 * market, or a buyer with none, titles the tab "Product" and says nothing
 * about whether the id exists.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const audience = await loadShopAudience();
  const product = audience.kind === "scoped" ? await loadShopProduct(id, audience.market) : null;
  return { title: `${product?.name ?? "Product"} · Zen Garden` };
}

export default async function ShopProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const audience = await loadShopAudience();
  // A buyer with no market has no product pages either — and this 404s
  // rather than showing the explanatory panel, because a bookmarked id must
  // not confirm that the product exists. The panel is what they get on the
  // pages they navigate to; a direct URL gets nothing.
  if (audience.kind === "unassigned") notFound();

  const product = await loadShopProduct(id, audience.market);
  // `loadShopProduct` applies the market predicate, so a product that is not
  // on offer — archived, needsReview, unpriced, or **in another market** —
  // 404s here rather than showing a price nobody can order at. This is the
  // check that makes another market's catalogue unreachable by URL, not
  // merely absent from the grid.
  if (!product) notFound();

  // The flavours first: "More from {brand}" must not offer a sibling the
  // picker is already showing on this page. Both are scoped, so a flavour or
  // a related product in another market is not offered either.
  const variants = await variantsOfProduct(product, audience.market);
  const related = await relatedShopProducts(
    product,
    audience.market,
    variants.map((sibling) => sibling.id),
  );

  const perPieceLabel =
    product.packSize === null
      ? null
      : `${formatMYR(new Prisma.Decimal(product.listPrice).dividedBy(product.packSize))} a piece · ${unitLabel(product.packSize, product.unit)}`;

  return (
    <div className="pt-lg">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-xs text-[length:var(--text-caption)] text-ink-tertiary"
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
        {/* One line: the title below prints the name in full, so a second
            full copy up here only pushes the price down a phone's screen. */}
        <span className="min-w-0 truncate text-ink" title={product.name}>
          {product.name}
        </span>
      </nav>

      <div className="mt-md grid gap-sm sm:gap-xl lg:grid-cols-[5fr_7fr]">
        <div className="self-start">
          <ProductGallery
            images={product.imageUrls.map((url, index) => ({
              id: `${product.id}-${index}`,
              url,
              position: index,
            }))}
            productName={product.name}
            canEdit={false}
            audience="buyer"
          />
        </div>

        <div>
          {product.brand ? (
            <p className="font-mono text-[length:var(--text-eyebrow)] uppercase text-ink-tertiary">
              {product.brand}
            </p>
          ) : null}
          <h1
            className={`font-display text-[length:var(--text-heading-md)] font-[650] text-ink sm:text-[length:var(--text-display-md)] ${product.brand ? "mt-xs" : ""}`}
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

          {variants.length > 1 ? (
            <div className="mt-md sm:mt-lg">
              <VariantPicker variants={variants} selectedId={product.id} />
            </div>
          ) : null}

          {/* Tighter below `sm` so the price and Add to cart land on a phone's
              first screen (Phase 57 J3). */}
          <div className="mt-md sm:mt-lg">
            <BuyBox
              productId={product.id}
              name={product.name}
              unit={product.unit}
              packSize={product.packSize}
              listPrice={product.listPrice}
              perPieceLabel={perPieceLabel}
              variants={variants}
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
              <ShopProductCard
                key={relatedProduct.id}
                group={singleGroup(relatedProduct)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
