"use client";

import { CertFilters, type CertFilterField } from "@/components/certificates/CertFilters";
import { DOT_TONE } from "@/components/certificates/CertDots";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { useTableSort } from "@/hooks/useTableSort";
import { DOC_LABEL, STATUS_LABEL, expiryStatus } from "@/lib/certification";
import { formatDate } from "@/lib/dates";
import { groupName } from "@/lib/product-groups";
import type { CertificateRow } from "@/lib/queries/certificates";
import type { SortDirection } from "@/lib/queries/pagination";

/** The files themselves: one row a certificate, whatever it covers. */
export function CertificatesTable({
  certificates,
  sort,
  today,
  fields,
  filtered,
}: {
  certificates: CertificateRow[];
  fields: CertFilterField[];
  /** A filter or search is narrowing the list, so empty means "no match". */
  filtered: boolean;
  sort: { key: string; dir: SortDirection };
  today: string;
}) {
  const onSortChange = useTableSort();
  const columns: Column<CertificateRow>[] = [
    {
      key: "originalName",
      header: "Certificate",
      cell: (row) => (
        <span className="block min-w-0 max-w-72">
          <span title={row.originalName} className="block truncate font-medium text-ink">
            {row.originalName}
          </span>
          <span className="block truncate text-[length:var(--text-caption)] text-ink-tertiary">
            {DOC_LABEL[row.type]}
            {row.reference ? ` · ${row.reference}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "expiresOn",
      header: "Expires",
      cell: (row) => {
        const status = expiryStatus(row.expiresOn, today);
        return (
          <span className="flex items-center gap-xs whitespace-nowrap">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT_TONE[status]}`} />
            {formatDate(row.expiresOn)}
            <span className="text-ink-tertiary">· {STATUS_LABEL[status]}</span>
          </span>
        );
      },
    },
    {
      key: "products",
      header: "Covers",
      defaultDir: "desc",
      cell: (row) => {
        // One name per product, not per flavour: the certificate covers them all.
        const names = [...new Set(row.products.map((product) => groupName(product)))];
        return (
          <span title={names.join("\n")} className="block max-w-72 truncate">
            {names.length === 0
              ? "No products yet"
              : names.length === 1
                ? names[0]
                : `${names.length} products · ${names[0]}…`}
          </span>
        );
      },
    },
    {
      key: "uploadedBy",
      header: "Uploaded",
      mobileHidden: true,
      cell: (row) => (
        <span className="whitespace-nowrap">
          {row.uploadedBy ?? "—"} · {formatDate(row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <>
      <CertFilters fields={fields} placeholder="File, number or product…" />
      <DataTable
      columns={columns}
      rows={certificates}
      sort={sort}
      onSortChange={onSortChange}
      rowHref={(row) => `/admin/certifications/${row.id}`}
      emptyText={filtered ? "No certificates match." : "No certificates uploaded yet."}
      emptyDescription={
        filtered
          ? "Clear a filter or the search to see more."
          : "Upload a Halal, notification or COA certificate to start."
      }
    />
    </>
  );
}
