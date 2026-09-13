"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { Input } from "@/components/ui/input";
import { useTableSort } from "@/hooks/useTableSort";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { CustomerRow } from "@/lib/queries/admin-customers";
import type { SortDirection } from "@/lib/queries/pagination";

/**
 * A client-side copy of `loginsLabel` (`src/lib/queries/admin-customers.ts`),
 * not an import of it. That module also imports `prisma`, and Turbopack
 * cannot chunk `@prisma/adapter-neon`'s `node:module` use for the browser —
 * pulling in even one runtime export drags the whole module, and the build
 * fails with "the chunking context (unknown) does not support external
 * modules". Every other table in this app (`UsersTable`, `BuyersTable`,
 * `ProductsList`) takes only *types* from its query module for exactly this
 * reason; this keeps the same rule rather than being the one exception.
 */
function loginsLabel(row: Pick<CustomerRow, "active" | "invited" | "disabled">): string {
  const parts: string[] = [];
  if (row.active > 0) parts.push(`${row.active} active`);
  if (row.invited > 0) parts.push(`${row.invited} invited`);
  if (row.disabled > 0) parts.push(`${row.disabled} disabled`);
  return parts.length > 0 ? parts.join(" · ") : "None";
}

export function CustomersTable({
  customers,
  sort,
}: {
  customers: CustomerRow[];
  sort: { key: string; dir: SortDirection };
}) {
  const onSortChange = useTableSort();
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const write = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      header: "Customer",
      cell: (row) => (
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
      ),
    },
    {
      key: "logins",
      header: "Shop logins",
      sortable: false,
      cell: (row) =>
        row.active + row.invited + row.disabled === 0 ? (
          <span className="text-ink-tertiary">None</span>
        ) : (
          loginsLabel(row)
        ),
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
  ];

  return (
    <>
      <div className="mb-sm flex flex-wrap items-center gap-sm">
        <Input
          aria-label="Search customers"
          placeholder="Company, contact or email…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            write(event.target.value);
          }}
          className="h-control-md w-64 sm:h-control-sm"
        />
      </div>

      <DataTable
        columns={columns}
        rows={customers}
        sort={sort}
        onSortChange={onSortChange}
        rowHref={(row) => `/admin/customers/${row.id}`}
        emptyText="No customers match."
      />
    </>
  );
}
