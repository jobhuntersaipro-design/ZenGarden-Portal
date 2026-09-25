"use client";

import { DataTable, type Column } from "@/components/portal/DataTable";
import { useTableSort } from "@/hooks/useTableSort";
import { formatDate } from "@/lib/dates";
import type { StockSheetRow } from "@/lib/queries/stock";
import { setPendingStockProduct } from "@/components/stock/pending-product";
import type { SortDirection } from "@/lib/queries/pagination";

/**
 * Stock, read the way the catalogue is read (Phase 55, revised 2026-09-22).
 *
 * It was one flat list of every active product with a live number box in each
 * row — no search, no paging, and 308 rows on production. Counting one product
 * meant scrolling past three hundred. This is `DataTable`, like `/products`:
 * search, sort, page, and a row that opens rather than a row you type into.
 *
 * A row links to `?product=<id>`, which is what opens the count drawer. That
 * keeps the open drawer in the URL, so it survives a reload and a back button
 * the way every other filter on this page does, and it lets `DataTable` do the
 * navigating with its own `rowHref` rather than a second click handler.
 */
export function StockTable({
  rows,
  sort,
}: {
  rows: StockSheetRow[];
  sort: { key: string; dir: SortDirection };
}) {
  const onSortChange = useTableSort();

  const columns: Column<StockSheetRow>[] = [
    {
      key: "name",
      header: "Product",
      cell: (row) => (
        <span className="block">
          <span title={row.name} className="block max-w-64 truncate font-medium text-ink">
            {row.name}
          </span>
          <span className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">
            {[row.sku, row.market].filter(Boolean).join(" · ")}
          </span>
        </span>
      ),
    },
    {
      key: "stockCartons",
      header: "Cartons",
      align: "right",
      defaultDir: "desc",
      /**
       * A dash is "nobody has counted", a zero is a count of none. The two
       * mean different things and the low-stock flag reads the difference.
       */
      cell: (row) =>
        row.stockCartons === null ? (
          <span className="text-ink-tertiary">—</span>
        ) : (
          <span className="tabular-nums">{row.stockCartons.toLocaleString("en-MY")}</span>
        ),
    },
    {
      key: "lastCountedOn",
      header: "Last counted",
      defaultDir: "desc",
      cell: (row) =>
        row.lastCountedOn ? (
          formatDate(row.lastCountedOn)
        ) : (
          <span className="text-ink-tertiary">Never</span>
        ),
    },
    {
      key: "action",
      header: "",
      sortable: false,
      align: "right",
      // The row already opens the drawer; this is the affordance that says so.
      cell: () => (
        <span className="text-[length:var(--text-caption)] font-medium text-brand-link">
          Count
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      sort={sort}
      onSortChange={onSortChange}
      emptyText="No products match."
      rowHref={(row) => `/stock?product=${row.id}`}
      onRowOpen={setPendingStockProduct}
    />
  );
}
