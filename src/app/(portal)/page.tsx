import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { ChurnList } from "@/components/dashboard/ChurnList";
import { DashboardFilters } from "@/components/dashboard/DashboardFilters";
import { DeliveryByMarket } from "@/components/dashboard/DeliveryByMarket";
import { MarketMixCard } from "@/components/dashboard/MarketMixCard";
import { TrendCard } from "@/components/dashboard/TrendCard";
import { DonutShare } from "@/components/dashboard/DonutShare";
import { InRangeGrid } from "@/components/dashboard/InRangeGrid";
import { KpiMoney, KpiNumber, KpiTile } from "@/components/dashboard/KpiTile";
import { MoreAnalytics } from "@/components/dashboard/MoreAnalytics";
import { PriceDriftList } from "@/components/dashboard/PriceDriftList";
import { RangeControls } from "@/components/dashboard/RangeControls";
import { WorkQueue } from "@/components/dashboard/WorkQueue";
import { SalesCard } from "@/components/dashboard/SalesCard";
import { PoTable, type PoRow } from "@/components/purchase-orders/PoTable";
import { Button } from "@/components/ui/button";
import { AGGREGATIONS, parseRange, rangeParams } from "@/lib/analytics/range";
import type { SalesMeasure } from "@/lib/analytics/sales";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { TREND_SUBJECTS, type TrendSubject } from "@/lib/analytics/trend";
import { loadDashboard } from "@/lib/queries/dashboard";
import {
  firstParam,
  parsePagination,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";
import { PO_LIST_SORT_KEYS } from "@/lib/queries/po-list.sql";
import { listPurchaseOrders } from "@/lib/queries/purchase-orders";
import { requirePagePermission } from "@/lib/permissions/require";

export const metadata: Metadata = { title: "Dashboard · Zen Garden Portal" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Phase 48: this destination is what `dashboard.view` names.
  await requirePagePermission("dashboard.view");
  const params = await searchParams;
  const range = parseRange(params);
  const measure: SalesMeasure =
    firstParam(params, "measure") === "units" ? "units" : "sales";
  const moreOpen = firstParam(params, "more") === "1";

  // The three product columns the page can narrow by, and the trend's own
  // subject and series. Read here and handed to the query, which echoes back
  // what it resolved — the toolbar renders that rather than the raw URL, so a
  // value the page fell back on can never sit in a control.
  const filter = {
    market: firstParam(params, "market") || undefined,
    brand: firstParam(params, "brand") || undefined,
    category: firstParam(params, "category") || undefined,
  };
  const trendParam = firstParam(params, "trend");
  const trend: TrendSubject = (TREND_SUBJECTS as readonly string[]).includes(
    trendParam ?? "",
  )
    ? (trendParam as TrendSubject)
    : "market";
  // Split preserves the interior blanks, and that is the point: a freed
  // colour slot is an assignment, not a gap.
  const seriesParam = firstParam(params, "series");
  const series = seriesParam ? seriesParam.split(",").map((id) => id.trim()) : [];

  const data = await loadDashboard(range, range.agg, {
    filter,
    trend,
    measure,
    series,
  });

  if (!data.hasAnyOrders) {
    return (
      <>
        <PageHeader eyebrow="Overview" title="Dashboard" />
        <section className="rounded-xxl border border-hairline bg-canvas p-xl text-center">
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Get started
          </p>
          <h2 className="mt-xs font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
            Upload your first purchase order
          </h2>
          <p className="mx-auto mt-xs max-w-[48ch] text-[length:var(--text-body-md)] text-ink-secondary">
            Drop a PDF or a photo and it is read into a draft you can check
            before it becomes a record.
          </p>
          {/* The only gradient button in the app. */}
          <Button asChild variant="gradient" className="mt-lg">
            <Link href="/upload">Upload a PO</Link>
          </Button>
        </section>
      </>
    );
  }

  const { from, to } = rangeParams(range);
  const aggLabel =
    AGGREGATIONS.find((option) => option.value === range.agg)?.unit ?? "day";

  // The in-range table runs the Phase 05 query with the dates fixed, so the
  // rows under the page agree with the numbers above them.
  const sort = parseSort(params, PO_LIST_SORT_KEYS, {
    key: "poDate",
    dir: "desc",
  });
  const { page, size, skip, take } = parsePagination(params);
  const list = await listPurchaseOrders(
    {
      status: "confirmed",
      from: range.from,
      to: range.to,
      // A row is a whole order, so it cannot narrow to lines the way the
      // figures above it do: it lists the orders that *touch* the filter, at
      // their full value, and the caption below says so. The *resolved*
      // filter, so the rows and the figures can never disagree about what is
      // being asked.
      ...data.query.filter,
    },
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

  return (
    <>
      <PageHeader eyebrow="Overview" title="Dashboard" />

      {/* Before the range controls, because it does not obey them: a draft has
          no PO date to filter on. */}
      <WorkQueue intake={data.intake} />

      <RangeControls
        preset={range.preset}
        from={from}
        to={to}
        agg={range.agg}
        summary={`${formatDate(range.from)} – ${formatDate(range.to)} · ${data.kpis.orderCount} purchase orders`}
        filterCaption={data.filterCaption}
      >
        <DashboardFilters
          markets={data.options.markets}
          brands={data.options.brands}
          categories={data.options.categories}
          hasNoMarket={data.attribution.noMarket > 0}
          selected={data.query.filter}
        />
      </RangeControls>

      {/* 1. Three tiles. No "Awaiting review" here — the status bar below is
          the one place the dashboard reports the backlog. */}
      <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
        <KpiTile
          wide
          label={data.filtered ? "Sales in this selection" : "Total sales"}
          value={<KpiMoney value={data.kpis.totalSales} />}
          caption={
            data.kpis.deltaPercent === null ? (
              <span className="text-ink-tertiary">
                No prior period to compare
              </span>
            ) : (
              <span
                className={
                  data.kpis.deltaPercent >= 0
                    ? "text-accent-green"
                    : "text-accent-red"
                }
              >
                {data.kpis.deltaPercent >= 0 ? "+" : ""}
                {data.kpis.deltaPercent.toFixed(0)}% vs. previous period
              </span>
            )
          }
        />
        <KpiTile
          label="Purchase orders"
          value={<KpiNumber value={data.kpis.orderCount} />}
          caption={
            // Under a filter this is the average of each order's *matching
            // lines*, not of the order — the §2.1 cost, said rather than hidden.
            data.filtered
              ? `${formatMYR(data.kpis.averageOrder.toFixed(2))} average per order, of these lines`
              : `${formatMYR(data.kpis.averageOrder.toFixed(2))} average`
          }
        />
        <KpiTile
          label="Top buyer"
          value={
            data.kpis.topBuyer ? (
              <Link
                href={`/buyers/${data.kpis.topBuyer.id}`}
                title={data.kpis.topBuyer.name}
                // Two lines before it clips, so a buyer's name is readable
                // rather than "Northwind Tr…" (brief G3).
                className="block line-clamp-2 text-[length:var(--text-heading-md)] leading-tight tracking-[-0.91px] hover:text-brand-link hover:underline"
              >
                {data.kpis.topBuyer.name}
              </Link>
            ) : (
              "—"
            )
          }
          caption={
            data.kpis.topBuyer
              ? `${formatMYR(data.kpis.topBuyer.total.toFixed(2))} · ${data.kpis.topBuyer.share.toFixed(0)}% of sales`
              : "No orders in this range"
          }
        />
      </div>

      {/* 2. Two charts: what the range's orders were worth, and what moved.
          Where the orders *stand* is the purchase-order page's question and
          lives on that page now, beside the rows a stage count is a count
          of — the dashboard reads by money and this board reads by order. */}
      <div className="mt-lg flex flex-col gap-lg">
        <SalesCard
          measure={measure}
          sales={data.sales}
          agg={range.agg}
          aggLabel={`${aggLabel}s`}
        />
        <TrendCard
          subject={data.trend.subject}
          measure={measure}
          points={data.trend.points}
          options={data.trend.options}
          slots={data.trend.slots}
        />
      </div>

      {/* 3. Everything a person goes looking for, behind one control. */}
      <MoreAnalytics open={moreOpen}>
        <div className="grid gap-lg lg:grid-cols-2">
          {/* Absent once a market is chosen: one slice is not a chart. */}
          {data.query.filter.market ? null : (
            <DonutShare
              eyebrow="Sales by market"
              slices={data.marketShare}
              centreLabel="top market"
              hrefBase="/products?market="
            />
          )}
          <DonutShare
            eyebrow="Share by buyer"
            slices={data.buyerShare}
            centreLabel="top buyer"
            hrefBase="/buyers"
          />
          <DonutShare
            eyebrow="Share by product"
            slices={data.productShare}
            centreLabel="top product"
            hrefBase="/products"
          />
        </div>
        <InRangeGrid data={data} />
        {data.query.filter.market ? null : (
          <div className="grid gap-lg lg:grid-cols-2">
            <MarketMixCard mix={data.marketMix} attribution={data.attribution} />
            <DeliveryByMarket delivery={data.delivery} />
          </div>
        )}
        <div className="grid gap-lg lg:grid-cols-2">
          <ChurnList churn={data.churn} />
          <PriceDriftList drift={data.drift} />
        </div>
      </MoreAnalytics>

      {/* 4. The table, last. */}
      <section className="mt-lg">
        <div className="mb-sm flex items-center justify-between gap-md">
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Purchase orders in range
          </p>
          <Link
            href={`/purchase-orders?from=${from}&to=${to}`}
            className="inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
          >
            View all →
          </Link>
        </div>
        {/* The one place on the page that cannot narrow to lines: a row is a
            whole order. Saying so is what keeps it from contradicting the
            figures above, whose total is smaller by design. */}
        {data.filtered ? (
          <p className="mb-sm text-[length:var(--text-body-sm)] text-ink-secondary">
            The orders that touch this selection, at their full value — so
            these totals are larger than the figures above, which count only
            the matching lines.
          </p>
        ) : null}
        <PoTable
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
