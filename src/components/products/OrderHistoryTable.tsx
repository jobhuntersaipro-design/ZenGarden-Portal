"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { TablePagination } from "@/components/portal/TablePagination";
import { StageBadge } from "@/components/portal/StatusBadge";
import { useTableSort } from "@/hooks/useTableSort";
import type { PoStage } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import type { OrderHistoryRow } from "@/lib/queries/product-detail";
import type { SortDirection } from "@/lib/queries/pagination";

/** Below this much under the day's list price, a line is worth noticing. */
const DISCOUNT_THRESHOLD = 1;

export function OrderHistoryTable({
  rows,
  sort,
  page,
  size,
  total,
}: {
  rows: (OrderHistoryRow & { id: string })[];
  sort: { key: string; dir: SortDirection };
  page: number;
  size: number;
  total: number;
}) {
  const onSortChange = useTableSort();

  const columns: Column<OrderHistoryRow & { id: string }>[] = [
    {
      key: "poNumber",
      header: "PO number",
      cell: (row) => <span className="font-medium">{row.poNumber}</span>,
    },
    {
      key: "buyerName",
      header: "Buyer",
      cell: (row) => (
        <Link
          href={`/buyers/${row.buyerId}`}
          title={row.buyerName}
          className="block max-w-48 truncate hover:text-brand-link hover:underline"
        >
          {row.buyerName}
        </Link>
      ),
    },
    {
      key: "poDate",
      header: "PO date",
      defaultDir: "desc",
      cell: (row) => formatDate(row.poDate),
    },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      defaultDir: "desc",
      cell: (row) => row.quantity,
    },
    {
      key: "unitPrice",
      header: "Unit price",
      align: "right",
      defaultDir: "desc",
      cell: (row) => {
        const belowBy =
          row.listPriceThen > 0
            ? ((row.listPriceThen - row.unitPrice) / row.listPriceThen) * 100
            : 0;
        if (belowBy <= DISCOUNT_THRESHOLD) return formatMYR(row.unitPrice.toFixed(2));

        // The highlight never carries the meaning alone: the tooltip and the
        // title both name both numbers (G2).
        const note = `Billed ${formatMYR(row.unitPrice.toFixed(2))} · list ${formatMYR(row.listPriceThen.toFixed(2))}`;
        return (
          <span title={note} aria-label={note} className="text-brand-amber">
            {formatMYR(row.unitPrice.toFixed(2))}
          </span>
        );
      },
    },
    {
      key: "amount",
      header: "Line total",
      align: "right",
      defaultDir: "desc",
      cell: (row) => formatMYR(row.amount.toFixed(2)),
    },
    {
      key: "poTotal",
      header: "PO total",
      align: "right",
      defaultDir: "desc",
      cell: (row) => formatMYR(row.poTotal.toFixed(2)),
    },
    {
      key: "stage",
      header: "Status",
      cell: (row) => <StageBadge stage={row.stage as PoStage} />,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        sort={sort}
        onSortChange={onSortChange}
        emptyText="No orders for this product in the last 12 months."
        rowHref={(row) => `/purchase-orders/${row.purchaseOrderId}`}
      />
      <TablePagination page={page} size={size} total={total} />
    </>
  );
}
