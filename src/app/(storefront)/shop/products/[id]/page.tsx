import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductGallery } from "@/components/products/ProductGallery";
import { AddToOrder } from "@/components/shop/AddToOrder";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { requireClient } from "@/lib/auth-guards";
import { unitLabel } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { cartCount } from "@/lib/queries/cart";
import { loadShopProduct } from "@/lib/queries/shop-catalogue";
import { shopHref } from "@/lib/shop-routes";

export const dynamic = "force-dynamic";

export default async function ShopProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { id: userId, buyerId } = await requireClient();

  const [buyer, count, product] = await Promise.all([
    prisma.buyer.findUnique({ where: { id: buyerId }, select: { name: true } }),
    cartCount(userId),
    loadShopProduct(id),
  ]);
  // loadShopProduct applies SHOP_VISIBLE, so a product that is not on offer
  // 404s here rather than showing a price nobody can order at.
  if (!product) notFound();

  return (
    <main>
      <ShopHeader buyerName={buyer?.name ?? ""} cartCount={count} />

      <Link
        href={shopHref.home()}
        className="mb-md inline-flex min-h-control-md items-center gap-xxs rounded-sm text-[length:var(--text-body-sm)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-control-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All products
      </Link>

      <div className="grid gap-lg lg:grid-cols-[5fr_7fr]">
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

        <section className="rounded-lg border border-hairline bg-canvas p-lg">
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            {[product.brand, product.category].filter(Boolean).join(" · ")}
          </p>
          <h1 className="mt-xxs font-display text-[length:var(--text-heading-md)] text-ink">
            {product.name}
          </h1>

          <p className="mt-md text-[length:var(--text-display-md)] font-semibold tabular-nums text-ink">
            {formatMYR(Number(product.listPrice))}
          </p>
          <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
            {`per ${product.unit} · ${unitLabel(product.packSize, product.unit)}`}
          </p>

          {product.description ? (
            <p className="mt-md text-[length:var(--text-body-sm)] text-ink-secondary">
              {product.description}
            </p>
          ) : null}

          <dl className="mt-md grid gap-sm sm:grid-cols-2">
            {[
              ["Code", product.sku],
              ["Variant", product.variant],
              ["Market", product.market],
              ["Pack size", product.packSize ? `${product.packSize} per ${product.unit}` : null],
            ]
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <div key={label as string}>
                  <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
                    {label}
                  </dt>
                  <dd className="text-[length:var(--text-body-sm)] text-ink">{value}</dd>
                </div>
              ))}
          </dl>

          <div className="mt-lg border-t border-hairline pt-md">
            <AddToOrder
              productId={product.id}
              name={product.name}
              packSize={product.packSize}
              unit={product.unit}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
