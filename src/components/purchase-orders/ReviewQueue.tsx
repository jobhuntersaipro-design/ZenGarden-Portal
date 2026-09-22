"use client";

import { DataTable } from "@/components/portal/DataTable";
import { NavCount } from "@/components/portal/NavCount";
import { ReviewCountSync } from "@/components/portal/ReviewCount";
import {
  poCard,
  poColumns,
  poRowHref,
  type PoRow,
} from "@/components/purchase-orders/PoTable";
import { formatMYR } from "@/lib/money";

/** Nothing to sort: the queue is always longest waiting first. */
const NO_SORT = { key: "", dir: "asc" as const };
const ignoreSort = () => {};

/**
 * Columns that say nothing about a row waiting on the team: none of them has
 * a PO date, an expected delivery or a confirmer yet, so each would read "—"
 * on every line.
 */
const QUEUE_HIDDEN = new Set(["poDate", "deliveryDate", "confirmedBy"]);

/**
 * Everything waiting on a person, above the purchase-order table (Phase 46):
 * shop orders sent or received but not yet confirmed, and uploads ready to
 * review. Those rows are not in the table below, so each order appears once.
 *
 * It ignores the page's search and filters on purpose — it is the team's
 * inbox, and it is what the sidebar's number counts. An empty queue renders
 * nothing, as the dashboard's "Needs you" card does: an "all clear" block
 * becomes chrome within a week.
 */
export function ReviewQueue({
  rows,
  sum,
  canDeleteOrders,
}: {
  rows: PoRow[];
  sum: string;
  canDeleteOrders: boolean;
}) {
  // The shell's count follows this section's, zero included.
  if (rows.length === 0) return <ReviewCountSync count={0} />;

  const columns = poColumns({ canDeleteOrders })
    .filter((column) => !QUEUE_HIDDEN.has(column.key))
    .map((column) => ({ ...column, sortable: false }));

  return (
    <section
      id="needs-review"
      aria-labelledby="needs-review-heading"
      className="mb-xl scroll-mt-xl"
    >
      <div className="mb-xxs flex items-center gap-xs">
        <h2
          id="needs-review-heading"
          className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink"
        >
          Needs review
        </h2>
        <NavCount count={rows.length} />
      </div>
      <p className="mb-sm text-[length:var(--text-body-sm)] text-ink-secondary">
        Waiting on the team, longest first ·{" "}
        <span className="tabular-nums">{formatMYR(sum)}</span>
      </p>
      <ReviewCountSync count={rows.length} />
      <DataTable
        columns={columns}
        rows={rows}
        sort={NO_SORT}
        onSortChange={ignoreSort}
        emptyText="Nothing needs review."
        rowHref={poRowHref}
        renderCard={poCard}
      />
    </section>
  );
}
