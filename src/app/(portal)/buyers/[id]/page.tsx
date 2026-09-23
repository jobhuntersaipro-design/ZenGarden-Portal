import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { BackLink } from "@/components/portal/BackLink";
import { CountUp } from "@/components/portal/CountUp";
import { PageHeader } from "@/components/portal/PageHeader";
import { StatusBar } from "@/components/dashboard/StatusBar";
import { KpiMoney, KpiNumber, KpiTile } from "@/components/dashboard/KpiTile";
import { SalesLineChart } from "@/components/dashboard/SalesLineChart";
import { BuyerContactsCard } from "@/components/buyers/BuyerContactsCard";
import { BuyerDetailsCard } from "@/components/buyers/BuyerDetailsCard";
import { BuyerRangeChips } from "@/components/buyers/BuyerRangeChips";
import { ProductTrend } from "@/components/buyers/ProductTrend";
import { ReorderSignalsCard } from "@/components/buyers/ReorderSignalsCard";
import { WhatTheyBuy } from "@/components/buyers/WhatTheyBuy";
import { PoTable, type PoRow } from "@/components/purchase-orders/PoTable";
import { Button } from "@/components/ui/button";
import {
  BUYER_RANGES,
  buyerPreviousPeriod,
  parseBuyerRange,
} from "@/lib/analytics/buyer-range";
import { INTAKE_VARS, cssVar } from "@/lib/analytics/palette";
import type { MixMeasure } from "@/lib/analytics/product-mix";
import { getSessionUser } from "@/lib/auth-guards";
import { formatDate, type Aggregation } from "@/lib/dates";
import { loadBuyer } from "@/lib/queries/buyer-detail";
import { listBuyerContacts } from "@/lib/queries/clients";
import {
  firstParam,
  parsePagination,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";
import { PO_LIST_SORT_KEYS } from "@/lib/queries/po-list.sql";
import { listPurchaseOrders } from "@/lib/queries/purchase-orders";
import { prisma } from "@/lib/prisma";
import { can, requirePagePermission } from "@/lib/permissions/require";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // The tab title names the record, so it answers the same question the
  // page does and is withheld on the same terms. `can`, not the page
  // guard: metadata has no 404 to render, it just says less.
  if (!(await can("buyer.view"))) return { title: "Buyer · Zen Garden Portal" };
  const buyer = await prisma.buyer.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: `${buyer?.name ?? "Buyer"} · Zen Garden Portal` };
}

/** Weekly and up: a buyer's own history is too sparse to read daily. */
const AGGS: Aggregation[] = ["week", "month", "quarter", "year"];

export default async function BuyerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  // Phase 48: this destination is what `buyer.view` names.
  await requirePagePermission("buyer.view");
  const { id } = await params;
  const query = await searchParams;

  const range = parseBuyerRange(query);
  const previous = buyerPreviousPeriod(range);
  const aggParam = firstParam(query, "agg") as Aggregation | undefined;
  const agg = AGGS.includes(aggParam as Aggregation) ? aggParam! : "month";
  const measure: MixMeasure =
    firstParam(query, "measure") === "qty" ? "qty" : "value";
  // Raw, holes included: an empty slot is a colour that was freed and is kept
  // free, so the products after it never shift hue.
  const productSlots = firstParam(query, "products")?.split(",") ?? [];
  const selectedProducts = productSlots.filter(Boolean);

  const [data, user, contacts] = await Promise.all([
    loadBuyer(id, range, previous, agg, measure, selectedProducts),
    getSessionUser(),
    listBuyerContacts(id),
  ]);
  if (!data) notFound();

  const sort = parseSort(query, PO_LIST_SORT_KEYS, {
    key: "poDate",
    dir: "desc",
  });
  const { page, size, skip, take } = parsePagination(query);
  const list = await listPurchaseOrders(
    { buyerId: id, status: "confirmed", from: range.from, to: range.to },
    sort,
    take,
    skip,
  );
  const rows: PoRow[] = list.rows.map((row) => ({
    ...row,
    poDate: row.poDate ? row.poDate.toISOString() : null,
    deliveryDate: row.deliveryDate ? row.deliveryDate.toISOString() : null,
    total: row.total.toString(),
    queuedAt: row.queuedAt ? row.queuedAt.toISOString() : null,
  }));

  const knows = (productId: string) =>
    productId === "" || data.productsInRange.some((p) => p.id === productId);
  const slots =
    selectedProducts.length > 0
      ? productSlots.filter(knows)
      : data.productsInRange.slice(0, 3).map((product) => product.id);

  return (
    <>
      <BackLink fallbackHref="/buyers" />
      <nav aria-label="Breadcrumb" className="mb-xs">
        <Link
          href="/buyers"
          className="inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
        >
          Buyers
        </Link>
        <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          {" / "}
          {data.buyer.name}
        </span>
      </nav>

      <PageHeader
        eyebrow="Buyer"
        title={data.buyer.name}
        action={
          <div className="flex flex-wrap items-center gap-xs">
            {user?.role === Role.SUPER_ADMIN ? (
              <Link
                href={`/admin/buyers/${id}`}
                className="inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
              >
                Manage in Admin ›
              </Link>
            ) : null}
            <Button asChild>
              {/* Pre-filled to this buyer, so the signal leads into the work. */}
              <Link href={`/upload?buyer=${encodeURIComponent(id)}`}>
                Upload PO
              </Link>
            </Button>
          </div>
        }
      />

      <BuyerRangeChips
        preset={range.preset}
        options={BUYER_RANGES}
        summary={`${formatDate(range.from)} – ${formatDate(range.to)} · ${data.kpis.orderCount} purchase orders · every number on this page follows this range`}
        aggregations={AGGS}
        agg={agg}
      />

      {/* Six columns, not five: the Purchases tile spans two, so five tiles
          occupy six tracks and the last one would otherwise wrap alone. */}
      <div className="mb-lg grid grid-cols-2 gap-md lg:grid-cols-6">
        <KpiTile
          compact
          wide
          label="Purchases"
          value={<KpiMoney value={data.kpis.purchases} />}
          caption={`${data.kpis.orderCount} purchase orders in range${data.buyer.since ? ` · buyer since ${formatDate(data.buyer.since)}` : ""}`}
        />
        {/* Full width on a phone like the two money tiles either side of it,
            so this row is a single tile rather than a tile and an empty cell.
            A KPI row below `sm` is one column or two and never a mix: the
            money tiles cannot share a 390px row, and a half tile stranded
            beside a gap was the orphan measured on 2026-09-22. */}
        <KpiTile
          compact
          mobileFull
          label="Share of sales"
          value={
            <KpiNumber value={data.kpis.shareOfSales} decimals={1} suffix="%" />
          }
          caption="of all buyers in range"
        />
        <KpiTile
          compact
          mobileFull
          label="Average PO"
          value={<KpiMoney value={data.kpis.averageOrder} />}
          caption={`${data.kpis.itemsPerOrder.toFixed(1)} items per order`}
        />
        <KpiTile
          compact
          label="Order cadence"
          value={
            data.kpis.cadenceDays === null ? (
              "—"
            ) : (
              <KpiNumber value={data.kpis.cadenceDays} />
            )
          }
          caption="days between orders"
        />
        <KpiTile
          compact
          label="Last order"
          value={
            data.kpis.daysSinceLastOrder === null
              ? "—"
              : `${data.kpis.daysSinceLastOrder}d ago`
          }
          caption={
            <span
              className={
                data.kpis.quieterThanUsual
                  ? "text-brand-amber"
                  : "text-accent-green"
              }
            >
              {data.kpis.quieterThanUsual
                ? "Quieter than usual — worth a call"
                : "On their usual rhythm"}
            </span>
          }
        />
      </div>

      <section className="rounded-xl bg-surface p-xl">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Order trend
        </p>
        <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
          <CountUp value={data.sales.total} format="money" /> across{" "}
          {data.sales.points.length}{" "}
          {agg === "week" ? "weeks" : agg === "month" ? "months" : `${agg}s`}
        </h2>
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          {data.kpis.orderCount} purchase orders · tap or hover a point for the
          value
        </p>
        <div className="mt-lg">
          <SalesLineChart series={data.sales} agg={agg} />
        </div>
      </section>

      <div className="mt-lg">
        <ProductTrend
          points={data.trend}
          products={data.productsInRange}
          slots={slots}
          totalProducts={data.productsInRange.length}
        />
      </div>

      <div className="mt-lg">
        <WhatTheyBuy slices={data.mix} measure={measure} hrefBase="/products" />
      </div>

      <div className="mt-lg grid gap-lg lg:grid-cols-2">
        <ReorderSignalsCard buyerId={id} reorder={data.reorder} />
        <BuyerDetailsCard
          buyer={data.buyer}
          canRename={user?.role === Role.SUPER_ADMIN}
        />
      </div>

      <div className="mt-lg">
        <BuyerContactsCard
          buyerId={id}
          contacts={contacts}
          canManage={user?.role === Role.SUPER_ADMIN}
        />
      </div>

      <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg">
        <StatusBar
          eyebrow="Status breakdown · intake"
          caption={`${data.kpis.orderCount} purchase orders`}
          segments={[
            {
              id: "confirmed",
              label: "Confirmed",
              count: data.intake.confirmed,
              color: cssVar(INTAKE_VARS.confirmed),
            },
            {
              id: "needs-review",
              label: "Needs review",
              count: data.intake.needsReview,
              color: cssVar(INTAKE_VARS.needsReview),
            },
            {
              id: "extracting",
              label: "Extracting",
              count: data.intake.extracting,
              color: cssVar(INTAKE_VARS.extracting),
            },
            {
              id: "failed",
              label: "Failed",
              count: data.intake.failed,
              color: cssVar(INTAKE_VARS.failed),
            },
            {
              id: "web",
              label: "From the shop",
              count: data.intake.webOrders,
              // Same amber as Needs review: both are work waiting on a person,
              // and the status palette binds the meaning to the colour
              // (00-master.md §4).
              color: cssVar(INTAKE_VARS.needsReview),
            },
          ]}
        />
      </section>

      <section className="mt-lg">
        <p className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Purchase orders
        </p>
        <PoTable
          hideBuyer
          rows={rows}
          sort={sort}
          page={page}
          size={size}
          total={list.total}
        />
      </section>
    </>
  );
}
