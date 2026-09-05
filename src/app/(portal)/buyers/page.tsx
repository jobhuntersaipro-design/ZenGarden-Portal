import type { Metadata } from "next";
import { PageHeader } from "@/components/portal/PageHeader";
import { UploadPoButton } from "@/components/portal/UploadPoButton";
import { AttentionStrip } from "@/components/buyers/AttentionStrip";
import { BuyersTable } from "@/components/buyers/BuyersTable";
import { BuyerRangeChips } from "@/components/buyers/BuyerRangeChips";
import {
  CountUpMoney,
  CountUpNumber,
  KpiTile,
} from "@/components/dashboard/KpiTile";
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

export const metadata: Metadata = { title: "Buyers · Loving Hands Portal" };
export const dynamic = "force-dynamic";

const FILTERS: BuyerFilter[] = ["lapsed", "at-risk", "overdue"];

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const range = parseBuyerRange(params);
  const previous = buyerPreviousPeriod(range);

  const filterParam = firstParam(params, "filter") as BuyerFilter;
  const filter = FILTERS.includes(filterParam) ? filterParam : null;
  const q = firstParam(params, "q")?.trim() || undefined;

  const sort = parseSort(params, BUYER_SORT_KEYS, { key: "total", dir: "desc" });
  const { page, size, skip, take } = parsePagination(params);

  const roster = await listBuyers(
    range,
    previous,
    filter,
    q,
    sort,
    skip,
    take,
  );

  return (
    <>
      <PageHeader eyebrow="Directory" title="Buyers" action={<UploadPoButton />} />

      <BuyerRangeChips
        preset={range.preset}
        summary={`${formatDate(range.from)} – ${formatDate(range.to)} · ${roster.kpis.buyersOnRecord} buyers · ${formatMYR(roster.kpis.rangeTotal.toFixed(2))} in range`}
        options={BUYER_RANGES}
      />

      <div className="mb-lg grid gap-md sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          compact
          label="Buyers with orders"
          value={<CountUpNumber value={roster.kpis.buyersWithOrders} />}
          caption={`of ${roster.kpis.buyersOnRecord} on record`}
        />
        <KpiTile
          compact
          label="New buyers"
          value={
            roster.kpis.newUnknowable ? "—" : (
              <CountUpNumber value={roster.kpis.newBuyers} />
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
          value={<CountUpNumber value={roster.kpis.atRiskOrLapsed} />}
          caption={
            <span className={roster.kpis.atRiskOrLapsed > 0 ? "text-brand-amber" : undefined}>
              {roster.kpis.lapsedCount} lapsed · {roster.kpis.atRiskCount} at risk
            </span>
          }
        />
        <KpiTile
          compact
          label="Revenue per buyer"
          value={<CountUpMoney value={roster.kpis.revenuePerBuyer} />}
          caption="average per buyer with orders"
        />
      </div>

      <AttentionStrip active={filter} counts={roster.attention} />

      <BuyersTable
        rows={roster.rows}
        sort={sort}
        page={page}
        size={size}
        total={roster.total}
        filter={filter}
      />
    </>
  );
}
