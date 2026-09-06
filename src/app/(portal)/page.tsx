import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { UploadPoButton } from "@/components/portal/UploadPoButton";
import { ChurnList } from "@/components/dashboard/ChurnList";
import { DonutShare } from "@/components/dashboard/DonutShare";
import { InRangeGrid } from "@/components/dashboard/InRangeGrid";
import { KpiMoney, KpiNumber, KpiTile } from "@/components/dashboard/KpiTile";
import { MoreAnalytics } from "@/components/dashboard/MoreAnalytics";
import { PriceDriftList } from "@/components/dashboard/PriceDriftList";
import { RangeControls } from "@/components/dashboard/RangeControls";
import { StatusBar } from "@/components/dashboard/StatusBar";
import { WorkQueue } from "@/components/dashboard/WorkQueue";
import { SalesCard } from "@/components/dashboard/SalesCard";
import { StageCard } from "@/components/dashboard/StageCard";
import { PoTable, type PoRow } from "@/components/purchase-orders/PoTable";
import { Button } from "@/components/ui/button";
import { AGGREGATIONS, parseRange, rangeParams } from "@/lib/analytics/range";
import type { SalesMeasure } from "@/lib/analytics/sales";
import { STAGE_VARS, cssVar } from "@/lib/analytics/palette";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { PO_STAGES, stageLabel } from "@/lib/po-stages";
import { loadDashboard } from "@/lib/queries/dashboard";
import {
  firstParam,
  parsePagination,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";
import { PO_LIST_SORT_KEYS } from "@/lib/queries/po-list.sql";
import { listPurchaseOrders } from "@/lib/queries/purchase-orders";

export const metadata: Metadata = { title: "Dashboard · Loving Hands Portal" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const range = parseRange(params);
  const measure: SalesMeasure =
    firstParam(params, "measure") === "units" ? "units" : "sales";
  const moreOpen = firstParam(params, "more") === "1";

  const data = await loadDashboard(range, range.agg);

  if (!data.hasAnyOrders) {
    return (
      <>
        <PageHeader
          eyebrow="Overview"
          title="Dashboard"
          action={<UploadPoButton />}
        />
        <section className="rounded-xxl border border-hairline bg-canvas p-xl text-center">
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Get started
          </p>
          <h2 className="mt-xs font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
            Upload your first purchase order
          </h2>
          <p className="mx-auto mt-xs max-w-[48ch] text-[length:var(--text-body-md)] text-ink-secondary">
            Drop a PDF or a photo and Claude reads it into a draft you can check
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
    { status: "confirmed", from: range.from, to: range.to },
    sort,
    take,
    skip,
  );
  const rows: PoRow[] = list.rows.map((row) => ({
    ...row,
    poDate: row.poDate ? row.poDate.toISOString() : null,
    total: row.total.toString(),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        action={<UploadPoButton />}
      />

      {/* Before the range controls, because it does not obey them: a draft has
          no PO date to filter on. */}
      <WorkQueue intake={data.intake} />

      <RangeControls
        preset={range.preset}
        from={from}
        to={to}
        agg={range.agg}
        summary={`${formatDate(range.from)} – ${formatDate(range.to)} · ${data.kpis.orderCount} purchase orders`}
      />

      {/* 1. Three tiles. No "Awaiting review" here — the status bar below is
          the one place the dashboard reports the backlog. */}
      <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
        <KpiTile
          wide
          label="Total sales"
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
          caption={`${formatMYR(data.kpis.averageOrder.toFixed(2))} average`}
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

      {/* 2. Two charts: what the range's orders were worth, then where they
          stand. The stage bar under the second chart is its legend, and the
          one place the dashboard reports the six stage counts — each count is
          the way into the rows it counts (brief §2). */}
      <div className="mt-lg flex flex-col gap-lg">
        <SalesCard
          measure={measure}
          sales={data.sales}
          agg={range.agg}
          aggLabel={`${aggLabel}s`}
        />
        <StageCard points={data.stages} openCount={data.pipeline.openCount}>
          <StatusBar
            segments={data.stageBreakdown.map((entry) => ({
              id: entry.stage,
              label: stageLabel(entry.stage),
              count: entry.count,
              color: cssVar(STAGE_VARS[PO_STAGES.indexOf(entry.stage)]),
              // Only confirmed orders have a stage, so the status is pinned
              // too — the list disables its stage filter otherwise.
              href: `/purchase-orders?status=confirmed&stage=${entry.stage}&from=${from}&to=${to}`,
            }))}
          />
        </StageCard>
      </div>

      {/* 3. Everything a person goes looking for, behind one control. */}
      <MoreAnalytics open={moreOpen}>
        <div className="grid gap-lg lg:grid-cols-2">
          <DonutShare
            eyebrow="Market share by buyer"
            slices={data.buyerShare}
            centreLabel="top buyer"
            hrefBase="/buyers"
          />
          <DonutShare
            eyebrow="Market share by product"
            slices={data.productShare}
            centreLabel="top product"
            hrefBase="/products"
          />
        </div>
        <InRangeGrid data={data} />
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
