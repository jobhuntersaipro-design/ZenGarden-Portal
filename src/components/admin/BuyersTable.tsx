"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ShopAccessBadge } from "@/components/admin/RingBadge";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "@/components/ui/person";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useTableSort } from "@/hooks/useTableSort";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import {
  NO_MARKET,
  NO_MARKET_LABEL,
  type BuyerMarketFilter,
} from "@/lib/buyer-markets";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  ACCESS_FILTERS,
  ACCESS_FILTER_LABELS,
  shopAccess,
  type AccessFilter,
} from "@/lib/queries/admin-buyer-labels";
import type { AdminBuyerRow } from "@/lib/queries/admin-buyers";
import type { SortDirection } from "@/lib/queries/pagination";

/**
 * The management roster: who can sign in, who never has, who has ordered.
 * The analytics roster (`/buyers`) answers a different question and keeps
 * its own table.
 *
 * The access chips carry counts computed over the whole roster, not the
 * filtered rows, so a chip never says "0" for the very filter that is
 * selected. Search and access filter compose.
 */
export function BuyersTable({
  buyers,
  sort,
  access,
  counts,
  market,
  markets,
  noMarket,
}: {
  buyers: AdminBuyerRow[];
  sort: { key: string; dir: SortDirection };
  access: AccessFilter;
  counts: Record<AccessFilter, number>;
  /** The *resolved* filter, never the raw parameter — see the page. */
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
  const choice = usePendingChoice<AccessFilter>(access);

  const hrefWith = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    return params.toString() ? `${pathname}?${params.toString()}` : pathname;
  };

  const columns: Column<AdminBuyerRow>[] = [
    {
      key: "name",
      header: "Buyer",
      cell: (row) => (
        <span className="flex items-center gap-xs">
          <PersonAvatar name={row.name} size="md" />
          <span className="block min-w-0">
            <span title={row.name} className="block truncate font-medium text-ink">
              {row.name}
            </span>
            {row.contactName ? (
              <span
                title={row.contactName}
                className="block truncate text-[length:var(--text-caption)] text-ink-tertiary"
              >
                {row.contactName}
              </span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "market",
      header: "Market",
      cell: (row) =>
        row.market ? (
          <span title={row.market} className="block max-w-48 truncate">
            {row.market}
          </span>
        ) : (
          // Not a dash alone: since 2026-09-23 a buyer with no market has an
          // empty shop, so this cell is the reason a customer cannot see
          // anything and the `title` says so rather than leaving a reader to
          // infer it from a blank.
          <span
            title="No market set — this buyer's shop is empty until one is."
            className="text-brand-amber"
          >
            Not set
          </span>
        ),
    },
    {
      key: "access",
      header: "Shop access",
      sortable: false,
      cell: (row) => <ShopAccessBadge access={shopAccess(row)} />,
    },
    {
      key: "lastActiveAt",
      header: "Last active",
      defaultDir: "desc",
      mobileHidden: true,
      cell: (row) =>
        row.lastActiveAt ? (
          formatDateTime(row.lastActiveAt)
        ) : (
          <span className="text-ink-tertiary">Never</span>
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
      key: "createdAt",
      header: "Since",
      defaultDir: "desc",
      mobileHidden: true,
      cell: (row) => formatDate(row.createdAt),
    },
    {
      key: "open",
      header: "",
      sortable: false,
      mobileHidden: true,
      align: "right",
      // The whole row is a link; the chevron is the hint, and it only shows
      // itself when the pointer says the row is being considered.
      cell: () => (
        <ChevronRight
          aria-hidden
          className="ml-auto size-4 text-ink-tertiary opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none"
        />
      ),
    },
  ];

  return (
    <>
      <div className="mb-sm flex flex-wrap items-center gap-sm">
        <Input
          aria-label="Search buyers"
          placeholder="Company, contact, email or market…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            replace(hrefWith({ q: event.target.value }));
          }}
          className="h-control-md w-64 sm:h-control-sm"
        />
        {/* Read off the roster, so it can never offer a market no buyer is
            in. "Not set" is offered only while some buyer has none — which
            on the first deploy is every one of them, and is the worklist
            this feature creates. */}
        {markets.length > 0 || noMarket > 0 ? (
          <select
            aria-label="Market"
            value={market ?? ""}
            onChange={(event) =>
              replace(hrefWith({ market: event.target.value || null }))
            }
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
        <div
          role="group"
          aria-label="Filter by shop access"
          aria-busy={choice.pending || undefined}
          className="flex flex-wrap items-center gap-xxs"
        >
          {ACCESS_FILTERS.map((value) => (
            <ChoiceButton
              key={value}
              look="pill"
              compact
              selected={choice.value === value}
              pending={choice.isPending(value)}
              dimmed={choice.pending && !choice.isPending(value)}
              onClick={() =>
                choice.choose(value, hrefWith({ access: value === "all" ? null : value }))
              }
            >
              {ACCESS_FILTER_LABELS[value]}
              <span className="tabular-nums opacity-70">{counts[value]}</span>
            </ChoiceButton>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={buyers}
        sort={sort}
        onSortChange={onSortChange}
        rowHref={(row) => `/admin/buyers/${row.id}`}
        emptyText="No buyers match."
        entrance
      />
    </>
  );
}
