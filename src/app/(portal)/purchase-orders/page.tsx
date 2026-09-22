import type { Metadata } from "next";
import { PageHeader } from "@/components/portal/PageHeader";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
import { UploadPoButton } from "@/components/portal/UploadPoButton";
import { PoFilters, type StatusChip } from "@/components/purchase-orders/PoFilters";
import { PoTable, type PoRow } from "@/components/purchase-orders/PoTable";
import { ReviewQueue } from "@/components/purchase-orders/ReviewQueue";
import { StageBoard } from "@/components/purchase-orders/StageBoard";
import { can } from "@/lib/permissions/require";
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
  type PoListRow,
} from "@/lib/queries/po-list.sql";
import {
  listFilterOptions,
  listPurchaseOrders,
  listReviewQueue,
} from "@/lib/queries/purchase-orders";
import { loadPoStageBoard } from "@/lib/queries/po-stages";
import { resolveStageWindow } from "@/lib/po-stage-window";
import { subDays } from "date-fns";

export const metadata: Metadata = {
  title: "Purchase orders · Zen Garden Portal",
};
export const dynamic = "force-dynamic";

// Must stay in step with StatusChip and with CHIPS in PoFilters. A chip whose
// value is missing here changes the URL and is then silently ignored by the
// page — the defect Phase 11 hit on /products. An old link carrying
// `needs-review`, `received` or `shop-open` falls back to All, and the rows it
// meant are in the review queue at the top of the same page (Phase 46).
const STATUSES: StatusChip[] = ["all", "confirmed", "extracting", "failed", "web"];

// Money and dates cross to the client as strings (00-master.md §4).
const toClientRow = (row: PoListRow): PoRow => ({
  ...row,
  poDate: row.poDate ? row.poDate.toISOString() : null,
  deliveryDate: row.deliveryDate ? row.deliveryDate.toISOString() : null,
  total: row.total.toString(),
  queuedAt: row.queuedAt ? row.queuedAt.toISOString() : null,
});

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

  // The stage board reads its own window, never the list's filters: the
  // table under the chart is a breakdown *of the bars*, so narrowing it by
  // the search or a status chip would leave the two disagreeing about which
  // orders they count. A window the URL does not name falls back to 30.
  const stageWindow = resolveStageWindow(firstParam(params, "stage_window"));
  const stageTo = new Date();
  const stageFrom = subDays(stageTo, Number(stageWindow) - 1);

  const sort = parseSort(params, PO_LIST_SORT_KEYS, {
    key: "poDate",
    dir: "desc",
  });
  const { page, size, skip, take } = parsePagination(params);

  const [{ rows, total, sum }, queue, { buyers, uploaders }, board] =
    await Promise.all([
      listPurchaseOrders(filters, sort, take, skip),
      listReviewQueue(),
      listFilterOptions(),
      loadPoStageBoard(stageFrom, stageTo, "day"),
    ]);
  const canDeleteOrders = await can("po.delete");
  const canUpload = await can("po.upload");

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Purchase orders"
        action={canUpload ? <UploadPoButton /> : null}
      />

      <ReviewQueue
        rows={queue.rows.map(toClientRow)}
        sum={queue.sum}
        canDeleteOrders={canDeleteOrders}
      />

      <StageBoard
        points={board.points}
        breakdown={board.breakdown}
        all={board.all}
        byBucket={board.byBucket}
        orderCount={board.orderCount}
        window={stageWindow}
        from={stageFrom.toLocaleDateString("en-CA")}
        to={stageTo.toLocaleDateString("en-CA")}
      />

      <PoFilters buyers={buyers} uploaders={uploaders} />

      {/* Counts and sums the same filtered set the table shows, so the number
          and the rows under it always agree (00-master.md §4). */}
      <p className="mb-sm text-[length:var(--text-body-sm)] text-ink-secondary">
        <span className="tabular-nums">{total}</span>{" "}
        {total === 1 ? "purchase order" : "purchase orders"} ·{" "}
        <span className="tabular-nums">{formatMYR(sum)}</span>
        <UpdatingHint />
      </p>

      <PoTable
        rows={rows.map(toClientRow)}
        sort={sort}
        page={page}
        size={size}
        total={total}
        canDeleteOrders={canDeleteOrders}
      />
    </>
  );
}
