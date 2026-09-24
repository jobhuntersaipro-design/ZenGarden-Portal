import type { Metadata } from "next";
import Link from "next/link";
import { can, requirePagePermission } from "@/lib/permissions/require";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { PageHeader } from "@/components/portal/PageHeader";
import { UploadPoButton } from "@/components/portal/UploadPoButton";
import { Button } from "@/components/ui/button";
import { AttentionStrip } from "@/components/buyers/AttentionStrip";
import { BuyersTable } from "@/components/buyers/BuyersTable";
import { NoMarketAlert } from "@/components/buyers/NoMarketAlert";
import { BuyerRangeChips } from "@/components/buyers/BuyerRangeChips";
import { KpiMoney, KpiNumber, KpiTile } from "@/components/dashboard/KpiTile";
import {
  BUYER_RANGES,
  buyerPreviousPeriod,
  parseBuyerRange,
} from "@/lib/analytics/buyer-range";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import {
  BUYER_SORT_KEYS,
  listBuyers,
  type BuyerFilter,
} from "@/lib/queries/buyers";
import {
  firstParam,
  parsePagination,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Buyers · Zen Garden Portal" };
export const dynamic = "force-dynamic";

const FILTERS: BuyerFilter[] = ["lapsed", "at-risk", "overdue"];

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Phase 48: this destination is what `buyer.view` names.
  await requirePagePermission("buyer.view");
  const params = await searchParams;
  const canManageBuyers = await can("buyer.manage");
  const range = parseBuyerRange(params);
  const previous = buyerPreviousPeriod(range);

  const filterParam = firstParam(params, "filter") as BuyerFilter;
  const filter = FILTERS.includes(filterParam) ? filterParam : null;
  const q = firstParam(params, "q")?.trim() || undefined;

  const sort = parseSort(params, BUYER_SORT_KEYS, {
    key: "total",
    dir: "desc",
  });
  const { page, size, skip, take } = parsePagination(params);

  const market = firstParam(params, "market");

  const roster = await listBuyers(range, previous, filter, q, market, sort, skip, take);

  return (
    <>
      <PageHeader
        eyebrow="Directory"
        title="Buyers"
        action={
          <div className="flex flex-wrap gap-xs">
            {canManageBuyers ? (
              <>
                {/* A real anchor, not a router push: cmd-click opens a tab for
                    free, the reasoning /products/new already recorded. */}
                <Button asChild>
                  <Link href="/buyers/new">
                    <LinkSpinner />
                    New buyer
                  </Link>
                </Button>
                {/* Two primaries would be no primary. A member sees Upload PO
                    as the page's only action and it stays primary for them. */}
                <UploadPoButton variant="secondary" />
              </>
            ) : (
              <UploadPoButton />
            )}
          </div>
        }
      />

      <BuyerRangeChips
        preset={range.preset}
        summary={`${formatDate(range.from)} – ${formatDate(range.to)} · ${roster.kpis.buyersOnRecord} buyers · ${formatMYR(roster.kpis.rangeTotal.toFixed(2))} in range`}
        options={BUYER_RANGES}
      />

      <div className="mb-lg grid grid-cols-2 gap-md lg:grid-cols-4">
        <KpiTile
          compact
          label="Buyers with orders"
          value={<KpiNumber value={roster.kpis.buyersWithOrders} />}
          caption={`of ${roster.kpis.buyersOnRecord} on record`}
        />
        <KpiTile
          compact
          label="New buyers"
          value={
            roster.kpis.newUnknowable ? (
              "—"
            ) : (
              <KpiNumber value={roster.kpis.newBuyers} />
            )
          }
          caption={
            // Saying so is better than reporting a number that means
            // "our records start here".
            roster.kpis.newUnknowable
              ? "Range reaches the start of the record"
              : "first order inside this range"
          }
        />
        <KpiTile
          compact
          label="At risk or lapsed"
          value={<KpiNumber value={roster.kpis.atRiskOrLapsed} />}
          caption={
            <span
              className={
                roster.kpis.atRiskOrLapsed > 0 ? "text-brand-amber" : undefined
              }
            >
              {roster.kpis.lapsedCount} lapsed · {roster.kpis.atRiskCount} at
              risk
            </span>
          }
        />
        <KpiTile
          compact
          mobileFull
          label="Revenue per buyer"
          value={<KpiMoney value={roster.kpis.revenuePerBuyer} />}
          caption="average per buyer with orders"
        />
      </div>

      <AttentionStrip active={filter} counts={roster.attention} />

      {/* Counted over every buyer on record, not the page of twenty being
          drawn — a buyer with no market is a customer who cannot order, and
          which page they sort onto has nothing to do with it. */}
      <NoMarketAlert
        count={roster.markets.noMarket}
        total={roster.kpis.buyersOnRecord}
        market={roster.market}
        basePath="/buyers"
      />

      <BuyersTable
        rows={roster.rows}
        sort={sort}
        page={page}
        size={size}
        total={roster.total}
        filter={filter}
        market={roster.market}
        markets={roster.markets.markets}
        noMarket={roster.markets.noMarket}
      />
    </>
  );
}
