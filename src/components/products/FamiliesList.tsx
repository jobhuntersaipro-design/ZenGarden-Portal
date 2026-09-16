"use client";

import { DataTable, type Column } from "@/components/portal/DataTable";
import { useTableSort } from "@/hooks/useTableSort";
import { formatMYR } from "@/lib/money";
import { NO_FAMILY, type FamilyRow } from "@/lib/product-families";
import type { SortDirection } from "@/lib/queries/pagination";

/**
 * The catalog by family (Phase 36 §4). A row is a product across every
 * market; its link opens the listing page (Phase 40), sectioned by market,
 * where membership can be seen and changed as a whole — and `DataTable`'s
 * card mode below `md` comes for free either way. The last row is the
 * products in no family, which has no listing of its own: it still opens the
 * product view filtered to "no family", so they stay countable and reachable
 * from here rather than invisible.
 */
export function FamiliesList({
  rows,
  sort,
}: {
  rows: FamilyRow[];
  sort: { key: string; dir: SortDirection };
}) {
  const onSortChange = useTableSort();

  const columns: Column<FamilyRow>[] = [
    {
      key: "name",
      header: "Family",
      cell: (row) => (
        <span className="block">
          <span title={row.name} className="block max-w-72 truncate font-medium text-ink">
            {row.name}
          </span>
          <span className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">
            {row.code}
          </span>
        </span>
      ),
    },
    { key: "brand", header: "Brand", cell: (row) => row.brand ?? "—" },
    { key: "category", header: "Category", cell: (row) => row.category },
    { key: "size", header: "Size", cell: (row) => row.size ?? "—" },
    {
      key: "variants",
      header: "Variants",
      align: "right",
      defaultDir: "desc",
      cell: (row) =>
        row.markets > 1 ? `${row.variants} · ${row.markets} markets` : row.variants,
    },
    {
      key: "markets",
      header: "Markets",
      align: "right",
      // Not one of `FAMILY_SORT_KEYS`: the list is already ordered on the
      // figures that matter, and a market count has no independent ordering
      // to offer.
      sortable: false,
      cell: (row) => row.markets,
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
        row.id === NO_FAMILY ? (
          <span className="rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-brand-amber">
            Unplaced
          </span>
        ) : row.toFix === 0 ? (
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
      emptyText="No families match."
      // The remainder row (products in no family) is a filter, not a
      // listing, and has no page of its own — it keeps its old link into
      // the product view. Every real family opens the listing page instead.
      rowHref={(row) =>
        row.id === NO_FAMILY
          ? `/products?family=${encodeURIComponent(row.id)}`
          : `/admin/catalogue/families/${row.id}`
      }
    />
  );
}
