import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/portal/PageHeader";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { OrderHistoryTable } from "@/components/products/OrderHistoryTable";
import { PriceTrendChart, type TrendMode } from "@/components/products/PriceTrendChart";
import { ProductGallery } from "@/components/products/ProductGallery";
import { ProductSheet } from "@/components/products/ProductSheet";
import { Button } from "@/components/ui/button";
import { WhatTheyBuy } from "@/components/buyers/WhatTheyBuy";
import { getSessionUser } from "@/lib/auth-guards";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { presignGet } from "@/lib/r2";
import { loadProduct } from "@/lib/queries/product-detail";
import {
  firstParam,
  parsePagination,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const HISTORY_SORT_KEYS = [
  "poNumber",
  "buyerName",
  "poDate",
  "quantity",
  "unitPrice",
  "amount",
  "poTotal",
  "stage",
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: `${product?.name ?? "Product"} · Loving Hands Portal` };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const [data, user] = await Promise.all([
    loadProduct(id, presignGet),
    getSessionUser(),
  ]);
  if (!data) notFound();

  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  const mode: TrendMode = firstParam(query, "trend") === "units" ? "units" : "price";

  const sort = parseSort(query, HISTORY_SORT_KEYS, { key: "poDate", dir: "desc" });
  const { page, size, skip, take } = parsePagination(query);

  const sorted = [...data.history].sort((a, b) => {
    const left = a[sort.key as keyof typeof a];
    const right = b[sort.key as keyof typeof b];
    const comparison =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
    return sort.dir === "asc" ? comparison : -comparison;
  });
  const rows = sorted
    .slice(skip, skip + take)
    .map((row) => ({ ...row, id: row.lineItemId }));

  const below = data.stats.vsListPercent < 0;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-xs">
        <Link
          href="/products"
          className="text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Products
        </Link>
        <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          {" / "}
          {data.product.name}
        </span>
      </nav>

      <PageHeader
        eyebrow={`${data.product.sku} · ${data.product.category} · per ${data.product.unit}`}
        title={data.product.name}
        action={
          <div className="flex items-center gap-sm">
            <span
              className={`rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] ${data.product.active ? "text-accent-green" : "text-ink-tertiary"}`}
            >
              {data.product.active ? "Active" : "Inactive"}
            </span>
            {isSuperAdmin ? (
              <ProductSheet
                product={{
                  id: data.product.id,
                  name: data.product.name,
                  sku: data.product.sku,
                  category: data.product.category as never,
                  unit: data.product.unit,
                  listPrice: data.product.listPrice.toFixed(2),
                  description: data.product.description,
                  active: data.product.active,
                }}
                trigger={<Button>Edit product</Button>}
              />
            ) : (
              <span className="rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-ink-secondary">
                View only
              </span>
            )}
          </div>
        }
      />

      <div className="grid gap-lg lg:grid-cols-[5fr_7fr]">
        <ProductGallery
          images={data.images}
          productName={data.product.name}
          canEdit={isSuperAdmin}
        />

        <section className="rounded-lg border border-hairline bg-canvas p-lg">
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
                List price
              </p>
              <p className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink tabular-nums">
                {formatMYR(data.product.listPrice.toFixed(2))}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
                Avg billed · 12m
              </p>
              <p className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink tabular-nums">
                {formatMYR(data.stats.avgBilled.toFixed(2))}
              </p>
              {/* Recomputes to the figure printed directly above it. */}
              <p
                className={`text-[length:var(--text-caption)] ${below ? "text-brand-amber" : data.stats.vsListPercent > 0 ? "text-accent-green" : "text-ink-tertiary"}`}
              >
                {data.stats.units === 0
                  ? "No sales in this window"
                  : `${Math.abs(data.stats.vsListPercent).toFixed(1)}% ${below ? "below" : "above"} list on average`}
              </p>
            </div>
          </div>

          {data.product.description ? (
            <p className="mt-md text-[length:var(--text-body-md)] text-ink-secondary">
              {data.product.description}
            </p>
          ) : null}

          <dl className="mt-md grid gap-sm sm:grid-cols-3">
            {[
              ["SKU", data.product.sku],
              ["Category", data.product.category],
              ["Unit", data.product.unit],
              ["First sold", data.stats.firstSold ? formatDate(data.stats.firstSold) : "—"],
              ["Last sold", data.stats.lastSold ? formatDate(data.stats.lastSold) : "—"],
              ["Updated", formatDateTime(data.product.updatedAt)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
                  {label}
                </dt>
                <dd title={value} className="truncate text-[length:var(--text-body-md)] text-ink">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div className="mt-lg grid gap-md sm:grid-cols-2 lg:grid-cols-6">
        {[
          {
            label: "Revenue · 12m",
            value: formatMYR(data.stats.revenue.toFixed(2)),
            caption: `${data.revenueShare.toFixed(1)}% of all sales`,
          },
          {
            label: "Units · 12m",
            value: Math.round(data.stats.units).toLocaleString("en-MY"),
            caption: `${data.stats.unitsPerOrder.toFixed(1)} units per order`,
          },
          {
            label: "Orders · 12m",
            value: String(data.stats.orders),
            caption: `from ${data.stats.buyers} buyers`,
          },
          {
            label: "Price drift · 12m",
            value:
              data.stats.driftPercent === null
                ? "—"
                : `${data.stats.driftPercent >= 0 ? "+" : ""}${data.stats.driftPercent.toFixed(1)}%`,
            caption: "first month billed → last",
          },
          {
            label: "Sales velocity",
            value: data.stats.velocity.toFixed(1),
            caption: "units per week, last 8 weeks",
          },
          {
            label: "Attach rate",
            value: `${data.stats.attachRate.toFixed(1)}%`,
            caption: "of all POs in 12 months",
          },
        ].map((tile) => (
          <KpiTile
            key={tile.label}
            compact
            label={tile.label}
            value={tile.value}
            caption={tile.caption}
          />
        ))}
      </div>

      <div className="mt-lg">
        <PriceTrendChart
          points={data.trend}
          listPrice={data.product.listPrice}
          mode={mode}
        />
      </div>

      <div className="mt-lg grid gap-lg lg:grid-cols-2">
        <WhatTheyBuy
          slices={data.buyers}
          measure="value"
          heading="Who buys it"
          showMeasureToggle={false}
        />
        <section className="rounded-lg border border-hairline bg-canvas p-lg">
          <p className="mb-md font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Bought together
          </p>
          {data.together.length === 0 ? (
            <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
              No other product has shared an order with this one.
            </p>
          ) : (
            <ul className="flex flex-col gap-sm">
              {data.together.map((entry) => (
                <li key={entry.productId} className="flex items-center gap-sm">
                  <Link
                    href={`/products/${entry.productId}`}
                    title={entry.productName}
                    className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink hover:text-brand-link hover:underline"
                  >
                    {entry.productName}
                  </Link>
                  <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                    {entry.coOccurrence.toFixed(0)}% of orders
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-lg">
        <p className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          {/* Same window and same rows as the tiles above (docs/specs §2). */}
          Order history · last 12 months · {data.stats.orders} purchase orders
        </p>
        <OrderHistoryTable
          rows={rows}
          sort={sort}
          page={page}
          size={size}
          total={data.history.length}
        />
      </section>
    </>
  );
}
