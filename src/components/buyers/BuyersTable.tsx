"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { TablePagination } from "@/components/portal/TablePagination";
import {
  BuyerStatusBadge,
  OverdueCount,
} from "@/components/buyers/BuyerStatusBadge";
import { Sparkline } from "@/components/buyers/Sparkline";
import { Input } from "@/components/ui/input";
import { useTableSort } from "@/hooks/useTableSort";
import {
  NO_MARKET,
  NO_MARKET_LABEL,
  type BuyerMarketFilter,
} from "@/lib/buyer-markets";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import type { BuyerFilter, BuyerRosterRow } from "@/lib/queries/buyers";
import type { SortDirection } from "@/lib/queries/pagination";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

const FILTER_LABEL: Record<Exclude<BuyerFilter, null>, string> = {
  lapsed: "lapsed",
  "at-risk": "at risk",
  overdue: "with overdue reorders",
};

const SEARCH_DEBOUNCE_MS = 200;

export function BuyersTable({
  rows,
  sort,
  page,
  size,
  total,
  filter,
  market,
  markets,
  noMarket,
}: {
  rows: BuyerRosterRow[];
  sort: { key: string; dir: SortDirection };
  page: number;
  size: number;
  total: number;
  filter: BuyerFilter;
  /** The filter the query actually applied, never the raw parameter. */
  market: BuyerMarketFilter;
  markets: string[];
  /** Buyers carrying no market, over the whole roster — the count, not a flag. */
  noMarket: number;
}) {
  const onSortChange = useTableSort();
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const write = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const columns: Column<BuyerRosterRow>[] = [
    {
      key: "name",
      header: "Buyer",
      cell: (row) => (
        <span className="block max-w-56 truncate font-medium" title={row.name}>
          {row.name}
        </span>
      ),
    },
    {
      key: "market",
      header: "Market",
      mobileHidden: true,
      cell: (row) =>
        row.market ? (
          <span className="block max-w-40 truncate" title={row.market}>
            {row.market}
          </span>
        ) : (
          // A buyer with no market cannot see anything in the shop, so this
          // is a state to act on rather than a blank. Amber, like every
          // other "needs attention" figure in the portal.
          <span
            className="text-brand-amber"
            title="No market set — this buyer's shop is empty until one is."
          >
            Not set
          </span>
        ),
    },
    {
      key: "orders",
      header: "Orders",
      align: "right",
      defaultDir: "desc",
      cell: (row) => row.orders,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      defaultDir: "desc",
      cell: (row) => formatMYR(row.total.toFixed(2)),
    },
    {
      key: "overdue",
      header: "Overdue",
      align: "right",
      defaultDir: "desc",
      cell: (row) => <OverdueCount count={row.overdue} />,
    },
    {
      key: "averageOrder",
      header: "Avg PO",
      align: "right",
      defaultDir: "desc",
      cell: (row) => formatMYR(row.averageOrder.toFixed(2)),
    },
    {
      key: "lastOrderAt",
      header: "Last order",
      defaultDir: "desc",
      cell: (row) =>
        row.lastOrderAt ? (
          formatDate(row.lastOrderAt)
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
    },
    {
      key: "cadenceDays",
      header: "Cadence",
      align: "right",
      defaultDir: "desc",
      cell: (row) =>
        row.cadenceDays === null ? (
          <span className="text-ink-tertiary">—</span>
        ) : (
          `${row.cadenceDays.toFixed(0)} d`
        ),
    },
    {
      key: "trend",
      header: "Trend",
      defaultDir: "desc",
      cell: (row) => (
        <Sparkline points={row.sparkline} muted={row.status === "lapsed"} />
      ),
    },
    {
      key: "status",
      header: "Status",
      defaultDir: "desc",
      cell: (row) => <BuyerStatusBadge status={row.status} />,
    },
  ];

  return (
    <>
      <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-xs top-1/2 size-4 -translate-y-1/2 text-ink-tertiary"
          />
          <Input
            aria-label="Search buyers"
            placeholder="Search buyers…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(
                () => write({ q: event.target.value }),
                SEARCH_DEBOUNCE_MS,
              );
            }}
            className="h-control-md sm:h-control-sm w-72 pl-xl"
          />
        </div>

        {/* Offered from the unfiltered roster, so narrowing to one market
            never removes the others from the control that would take you
            back. "No market" appears only while some buyer has none. */}
        {markets.length > 0 || noMarket > 0 ? (
          <select
            aria-label="Market"
            value={market ?? ""}
            onChange={(event) => write({ market: event.target.value || null })}
            className="h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus sm:h-control-sm"
          >
            <option value="">All markets</option>
            {markets.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
            {noMarket > 0 ? <option value={NO_MARKET}>{NO_MARKET_LABEL}</option> : null}
          </select>
        ) : null}

        <div className="flex items-center gap-sm">
          <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
            <span className="tabular-nums">{total}</span>{" "}
            {total === 1 ? "buyer" : "buyers"}
            {/* The summary names the filter that is on, so the number is never
                unexplained. */}
            {filter ? ` · ${FILTER_LABEL[filter]}` : ""}
            {market
              ? ` · ${market === NO_MARKET ? "no market set" : `${market} only`}`
              : ""}
          </p>
          {filter || query || market ? (
            <button
              type="button"
              onClick={() => {
                if (timer.current) clearTimeout(timer.current);
                setQuery("");
                write({ filter: null, q: null, market: null });
              }}
              className="text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Clear filter
            </button>
          ) : null}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        sort={sort}
        onSortChange={onSortChange}
        emptyText="No buyers match."
        rowHref={(row) => `/buyers/${row.id}`}
      />
      <TablePagination page={page} size={size} total={total} />
    </>
  );
}
