import type { Metadata } from "next";
import { PageHeader } from "@/components/portal/PageHeader";
import { UploadPoButton } from "@/components/portal/UploadPoButton";
import { PoFilters, type StatusChip } from "@/components/purchase-orders/PoFilters";
import { PoTable, type PoRow } from "@/components/purchase-orders/PoTable";
import { formatMYR } from "@/lib/money";
import {
  firstParam,
  parsePagination,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";
import {
  PO_LIST_SORT_KEYS,
  type PoListFilters,
} from "@/lib/queries/po-list.sql";
import {
  listFilterOptions,
  listPurchaseOrders,
} from "@/lib/queries/purchase-orders";

export const metadata: Metadata = {
  title: "Purchase orders · Loving Hands Portal",
};
export const dynamic = "force-dynamic";

const STATUSES: StatusChip[] = [
  "all",
  "confirmed",
  "needs-review",
  "extracting",
  "failed",
];

const asDate = (value: string | undefined) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const status = firstParam(params, "status");
  const filters: PoListFilters = {
    q: firstParam(params, "q")?.trim() || undefined,
    buyerId: firstParam(params, "buyer") || undefined,
    uploadedById: firstParam(params, "by") || undefined,
    status: STATUSES.includes(status as StatusChip)
      ? (status as StatusChip)
      : "all",
    stage: firstParam(params, "stage") || undefined,
    from: asDate(firstParam(params, "from")),
    to: asDate(firstParam(params, "to")),
  };

  const sort = parseSort(params, PO_LIST_SORT_KEYS, {
    key: "poDate",
    dir: "desc",
  });
  const { page, size, skip, take } = parsePagination(params);

  const { rows, total, sum, needsReview } = await listPurchaseOrders(
    filters,
    sort,
    take,
    skip,
  );
  const { buyers, uploaders } = await listFilterOptions();

  // Money and dates cross to the client as strings (00-master.md §4).
  const clientRows: PoRow[] = rows.map((row) => ({
    ...row,
    poDate: row.poDate ? row.poDate.toISOString() : null,
    total: row.total.toString(),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Purchase orders"
        action={<UploadPoButton />}
      />

      <PoFilters
        buyers={buyers}
        uploaders={uploaders}
        needsReview={needsReview}
      />

      {/* Counts and sums the same filtered set the table shows, so the number
          and the rows under it always agree (00-master.md §4). */}
      <p className="mb-sm text-[length:var(--text-body-sm)] text-ink-secondary">
        <span className="tabular-nums">{total}</span>{" "}
        {total === 1 ? "purchase order" : "purchase orders"} ·{" "}
        <span className="tabular-nums">{formatMYR(sum)}</span>
      </p>

      <PoTable
        rows={clientRows}
        sort={sort}
        page={page}
        size={size}
        total={total}
      />
    </>
  );
}
