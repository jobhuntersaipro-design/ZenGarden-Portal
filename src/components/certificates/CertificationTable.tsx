"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { clearCertOverride, setCertOverride } from "@/actions/certificates";
import { CertFilters, type CertFilterField } from "@/components/certificates/CertFilters";
import { DOT_TONE } from "@/components/certificates/CertDots";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { useTableSort } from "@/hooks/useTableSort";
import {
  CERT_LABEL,
  STATUS_LABEL,
  type CertType,
} from "@/lib/certification";
import { OVERVIEW_SHOW, type OverviewShow } from "@/lib/certification-overview";
import { formatDate } from "@/lib/dates";
import { plural } from "@/lib/plural";
import type { OverviewRow } from "@/lib/queries/certificates";
import type { SortDirection } from "@/lib/queries/pagination";
import { toast } from "@/lib/toast";

const SHOW_LABEL: Record<OverviewShow, string> = {
  all: "All products",
  attention: "Needs attention",
};

/**
 * Every product × Halal / NOT / COA (2026-10-14). A cell opens the override
 * for that product and type: the one decision made here rather than on a
 * certificate.
 */
export function CertificationTable({
  rows,
  sort,
  show,
  counts,
  fields,
}: {
  rows: OverviewRow[];
  sort: { key: string; dir: SortDirection };
  show: OverviewShow;
  counts: Record<OverviewShow, number>;
  fields: CertFilterField[];
}) {
  const onSortChange = useTableSort();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const choice = usePendingChoice<OverviewShow>(show);
  const [open, setOpen] = useState<{ row: OverviewRow; type: CertType } | null>(null);

  const hrefWith = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    return params.toString() ? `${pathname}?${params.toString()}` : pathname;
  };

  const statusCell = (type: CertType): Column<OverviewRow> => ({
    key: type,
    header: type === "HL" ? "Halal" : type,
    defaultDir: "desc",
    cell: (row) => {
      const cell = row.certs[type];
      return (
        <button
          type="button"
          onClick={() => setOpen({ row, type })}
          title={`${CERT_LABEL[type]} for ${row.name} — open to override`}
          aria-label={`${CERT_LABEL[type]} for ${row.name}: ${STATUS_LABEL[cell.status]}${cell.overridden ? ", override" : ""}`}
          className="-mx-xs flex min-h-control-md items-center gap-xs rounded-sm px-xs text-left hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-focus sm:min-h-0"
        >
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT_TONE[cell.status]}`} />
          <span className="block">
            <span className="block whitespace-nowrap text-ink">
              {STATUS_LABEL[cell.status]}
              {cell.overridden ? " · override" : ""}
            </span>
            {cell.expiresOn ? (
              <span className="block whitespace-nowrap text-[length:var(--text-caption)] text-ink-tertiary">
                {formatDate(cell.expiresOn)}
              </span>
            ) : null}
          </span>
        </button>
      );
    },
  });

  const columns: Column<OverviewRow>[] = [
    {
      key: "name",
      header: "Product",
      cell: (row) => (
        <span className="block min-w-0 max-w-72">
          <span title={row.name} className="block truncate font-medium text-ink">
            {row.name}
          </span>
          <span className="block truncate text-[length:var(--text-caption)] text-ink-tertiary">
            {row.variants > 1 ? `${plural(row.variants, "variant")}` : row.sku}
          </span>
        </span>
      ),
    },
    {
      key: "market",
      header: "Market",
      cell: (row) => row.market ?? <span className="text-ink-tertiary">—</span>,
    },
    statusCell("HL"),
    statusCell("NOT"),
    statusCell("COA"),
  ];

  return (
    <>
      <CertFilters fields={fields} placeholder="Product, SKU or market…">
        <div
          role="group"
          aria-label="Show"
          aria-busy={choice.pending || undefined}
          className="flex flex-wrap items-center gap-xxs"
        >
          {OVERVIEW_SHOW.map((value) => (
            <ChoiceButton
              key={value}
              look="pill"
              selected={choice.value === value}
              pending={choice.isPending(value)}
              dimmed={choice.pending && !choice.isPending(value)}
              onClick={() => choice.choose(value, hrefWith({ show: value === "all" ? null : value }))}
            >
              {SHOW_LABEL[value]}
              <span className="tabular-nums opacity-70">{counts[value]}</span>
            </ChoiceButton>
          ))}
        </div>
      </CertFilters>

      <DataTable
        columns={columns}
        rows={rows}
        sort={sort}
        onSortChange={onSortChange}
        emptyText="No products match."
      />

      {open ? (
        <OverrideDialog key={`${open.row.id}-${open.type}`} {...open} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

function OverrideDialog({
  row,
  type,
  onClose,
}: {
  row: OverviewRow;
  type: CertType;
  onClose: () => void;
}) {
  const refresh = useAwaitableRefresh();
  const cell = row.certs[type];
  const override = row.overrides[type];
  const [reason, setReason] = useState(override?.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => ReturnType<typeof setCertOverride>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error);
        return;
      }
      await refresh();
      toast.success(done);
      onClose();
    } catch {
      setError("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {CERT_LABEL[type]} · {row.name}
          </DialogTitle>
          <DialogDescription>
            {STATUS_LABEL[cell.status]}
            {cell.expiresOn ? `, expires ${formatDate(cell.expiresOn)}` : ""}.{" "}
            {override
              ? `Approved by ${override.by ?? "an admin"} on ${formatDate(override.at)}.`
              : "Mark it approved anyway, with the reason. Linking a new certificate of this type clears it."}
          </DialogDescription>
        </DialogHeader>
        <label className="block text-[length:var(--text-body-sm)] text-ink">
          Reason
          <Textarea
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            placeholder="e.g. Notification not required for this product"
            className="mt-xxs"
            aria-invalid={error ? true : undefined}
          />
        </label>
        {error ? (
          <p role="alert" className="text-[length:var(--text-body-sm)] text-accent-red">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {override ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(() => clearCertOverride({ productId: row.id, type }), "Override removed")
              }
            >
              Remove override
            </Button>
          ) : null}
          <Button
            pending={busy}
            disabled={busy}
            onClick={() =>
              run(
                () => setCertOverride({ productId: row.id, type, reason }),
                "Marked approved",
              )
            }
          >
            {override ? "Save reason" : "Mark approved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

