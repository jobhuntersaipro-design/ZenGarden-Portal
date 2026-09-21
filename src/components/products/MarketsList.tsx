"use client";

import { DataTable, type Column } from "@/components/portal/DataTable";
import { useTableSort } from "@/hooks/useTableSort";
import { formatMYR } from "@/lib/money";
import type { MarketRow } from "@/lib/product-markets";
import type { SortDirection } from "@/lib/queries/pagination";

/**
 * The catalog by market — the mirror of `FamiliesList`.
 *
 * Every row opens that market's products, which is the whole maintenance
 * loop: read down Status to find where the work is, click in to do it. The
 * last row is the products carrying no market, and it links the same way
 * through the `NO_MARKET` sentinel, so they are reachable rather than merely
 * counted.
 *
 * Unlike the family view's unplaced row, which prints "Unplaced" in place of
 * its count, this one prints its real "N to fix". A product with no market is
 * not by itself broken — it is one of several things this view is for — and
 * hiding how many of them *are* broken would cost the row the only figure
 * that says whether it needs opening.
 */
export function MarketsList({
  rows,
  sort,
}: {
  rows: MarketRow[];
  sort: { key: string; dir: SortDirection };
}) {
  const onSortChange = useTableSort();

  const columns: Column<MarketRow>[] = [
    {
      key: "name",
      header: "Market",
      cell: (row) => (
        <span
          title={row.name}
          className="block max-w-72 truncate font-medium text-ink"
        >
          {row.name}
        </span>
      ),
    },
    {
      key: "products",
      header: "Products",
      align: "right",
      defaultDir: "desc",
      cell: (row) => row.products,
    },
    {
      key: "active",
      header: "Active",
      align: "right",
      // Not one of `MARKET_SORT_KEYS`: it tracks Products closely enough that
      // ordering on it would say nothing the Products column has not, and
      // Status is what a reader sorts on when they want the gap.
      sortable: false,
      cell: (row) => row.active,
    },
    {
      key: "brands",
      header: "Brands",
      align: "right",
      // The reciprocal of the family view's Markets column, and left
      // unsortable for the same reason it is there.
      sortable: false,
      cell: (row) => row.brands,
    },
    {
      key: "units",
      header: "Units · 12m",
      align: "right",
      defaultDir: "desc",
      cell: (row) => Math.round(row.units).toLocaleString("en-MY"),
    },
    {
      key: "revenue",
      header: "Revenue · 12m",
      align: "right",
      defaultDir: "desc",
      cell: (row) => formatMYR(row.revenue.toFixed(2)),
    },
    {
      key: "buyers",
      header: "Buyers",
      align: "right",
      defaultDir: "desc",
      cell: (row) => row.buyers,
    },
    {
      key: "status",
      header: "Status",
      defaultDir: "desc",
      cell: (row) =>
        row.toFix === 0 ? (
          <span className="rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-accent-green">
            OK
          </span>
        ) : (
          <span className="rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-brand-amber">
            {row.toFix} to fix
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
      emptyText="No markets match."
      rowHref={(row) => `/products?market=${encodeURIComponent(row.id)}`}
    />
  );
}
