"use client";

import { DataTable, type Column } from "@/components/portal/DataTable";
import { useTableSort } from "@/hooks/useTableSort";
import { formatMYR } from "@/lib/money";
import type { ProductRow } from "@/lib/queries/products";
import type { SortDirection } from "@/lib/queries/pagination";

export function ProductsList({
  rows,
  sort,
}: {
  rows: ProductRow[];
  sort: { key: string; dir: SortDirection };
}) {
  const onSortChange = useTableSort();

  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Product",
      cell: (row) => (
        <span className="block">
          <span
            title={row.name}
            className="block max-w-64 truncate font-medium text-ink"
          >
            {row.name}
          </span>
          <span className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">
            {[row.sku, row.brand, row.variant, row.market]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      ),
    },
    {
      key: "family",
      header: "Family",
      sortable: false,
      cell: (row) =>
        row.family ? (
          <span title={row.family.name} className="font-mono text-ink-secondary">
            {row.family.code}
          </span>
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
    },
    { key: "category", header: "Category", cell: (row) => row.category },
    {
      key: "listPrice",
      header: "List price",
      align: "right",
      defaultDir: "desc",
      cell: (row) => formatMYR(row.listPrice.toFixed(2)),
    },
    {
      /**
       * Cartons on hand, counted by the team. A dash is "not counted yet"; a
       * zero is a count, so it prints as 0 and reads amber like any other
       * figure under the low-stock line.
       */
      key: "stock",
      header: "Stock",
      align: "right",
      defaultDir: "asc",
      cell: (row) =>
        row.stockCartons === null ? (
          <span className="text-ink-tertiary" title="Not counted yet">
            —
          </span>
        ) : (
          <span
            className={`tabular-nums ${
              row.flags.includes("low-stock") ? "text-brand-amber" : "text-ink"
            }`}
          >
            {row.stockCartons.toLocaleString("en-MY")}
          </span>
        ),
    },
    {
      key: "drift",
      header: "Drift · 12m",
      align: "right",
      defaultDir: "desc",
      cell: (row) =>
        row.stats.driftPercent === null ? (
          <span className="text-ink-tertiary">—</span>
        ) : (
          <span
            className={
              row.stats.driftPercent >= 0 ? "text-accent-green" : "text-accent-red"
            }
          >
            {row.stats.driftPercent >= 0 ? "+" : ""}
            {row.stats.driftPercent.toFixed(1)}%
          </span>
        ),
    },
    {
      key: "units",
      header: "Units · 12m",
      align: "right",
      defaultDir: "desc",
      cell: (row) => Math.round(row.stats.units).toLocaleString("en-MY"),
    },
    {
      key: "revenue",
      header: "Revenue · 12m",
      align: "right",
      defaultDir: "desc",
      cell: (row) => formatMYR(row.stats.revenue.toFixed(2)),
    },
    {
      key: "buyers",
      header: "Buyers",
      align: "right",
      defaultDir: "desc",
      cell: (row) => row.stats.buyers,
    },
    {
      key: "status",
      header: "Status",
      defaultDir: "desc",
      cell: (row) =>
        row.flags.length === 0 ? (
          <span className="rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-accent-green">
            OK
          </span>
        ) : (
          <span
            className={`rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] ${row.active ? "text-brand-amber" : "text-ink-tertiary"}`}
          >
            {row.active ? `${row.flags.length} to fix` : "Unpublished"}
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
      rowHref={(row) => `/products/${row.id}`}
    />
  );
}
