"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createLabel, removeLabel, renameLabel } from "@/actions/catalog-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/portal/Spinner";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import type { CatalogLabelKind } from "@/generated/prisma/enums";
import { LABEL_FIELD, LABEL_NOUN, isProtectedLabel } from "@/lib/catalog-labels";
import type { LabelRow } from "@/lib/queries/catalog-labels";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * One vocabulary — brands, variants, markets or categories — with what uses
 * each value and the three things a super admin can do to it.
 *
 * Rename is an inline edit rather than a dialog: it is the common act (a
 * typo, a capitalisation) and the row is the thing being renamed, so putting
 * the field anywhere else would separate the two. Remove asks nothing, because
 * it is only ever offered on a value **no product uses** — there is nothing to
 * lose and nothing to confirm.
 */
export function CatalogLabelSection({
  kind,
  rows,
}: {
  kind: CatalogLabelKind;
  rows: LabelRow[];
}) {
  const refresh = useAwaitableRefresh();
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const noun = LABEL_NOUN[kind];
  // The catalog filters on brand and category by name; variant and market are
  // not filters there, but the search box does read both, so their counts
  // still lead somewhere that shows the products in question.
  const field = LABEL_FIELD[kind];
  const href = (value: string) =>
    field === "brand" || field === "category"
      ? `/products?${field}=${encodeURIComponent(value)}`
      : `/products?q=${encodeURIComponent(value)}`;

  const add = async () => {
    const value = adding.trim();
    if (!value) return;
    setBusy("add");
    try {
      const result = await createLabel({ kind, value });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setAdding("");
      toast.success(`“${value}” added.`);
      await refresh();
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const rename = async (row: LabelRow) => {
    const value = draft.trim();
    if (!value || value === row.value) {
      setEditing(null);
      return;
    }
    setBusy(row.id);
    try {
      const result = await renameLabel({ id: row.id, value });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEditing(null);
      // The count is the point: a rename here rewrote that many products, and
      // a silent success would hide how far the change reached.
      toast.success(
        result.data.products > 0
          ? `Renamed to “${value}” — ${result.data.products} ${
              result.data.products === 1 ? "product" : "products"
            } updated.`
          : `Renamed to “${value}”.`,
      );
      await refresh();
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: LabelRow) => {
    setBusy(row.id);
    try {
      const result = await removeLabel(row.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`“${row.value}” removed.`);
      await refresh();
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-xs">
        <h2 className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
          {noun.many}
        </h2>
        <p className={caption}>
          {rows.length} {rows.length === 1 ? "value" : "values"}
        </p>
      </div>

      {rows.length > 0 ? (
        <ul className="mt-sm divide-y divide-hairline">
          {rows.map((row) => {
            const locked = isProtectedLabel(kind, row.value);
            const working = busy === row.id;
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-xs py-xs sm:flex-nowrap"
              >
                {editing === row.id ? (
                  <>
                    <Input
                      aria-label={`Rename ${row.value}`}
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void rename(row);
                        if (event.key === "Escape") setEditing(null);
                      }}
                      className="min-w-0 flex-1"
                    />
                    <RowButton
                      label={`Save ${row.value}`}
                      onClick={() => void rename(row)}
                      disabled={working}
                    >
                      {working ? <Spinner /> : <Check className="size-4" aria-hidden />}
                    </RowButton>
                    <RowButton
                      label="Cancel rename"
                      onClick={() => setEditing(null)}
                      disabled={working}
                    >
                      <X className="size-4" aria-hidden />
                    </RowButton>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink">
                      {row.value}
                    </span>
                    {/* The count is a link into the catalog filtered by this
                        value, so "3 products" can be read rather than trusted. */}
                    {row.products > 0 ? (
                      <Link
                        href={href(row.value)}
                        className={`${caption} shrink-0 whitespace-nowrap text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
                      >
                        {row.products} {row.products === 1 ? "product" : "products"}
                      </Link>
                    ) : (
                      <span className={`${caption} shrink-0 whitespace-nowrap`}>
                        No products
                      </span>
                    )}
                    <RowButton
                      label={`Rename ${row.value}`}
                      disabled={locked || working}
                      title={
                        locked
                          ? "The purchase-order intake writes this value, so it stays"
                          : undefined
                      }
                      onClick={() => {
                        setEditing(row.id);
                        setDraft(row.value);
                      }}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </RowButton>
                    <RowButton
                      label={`Remove ${row.value}`}
                      // Disabled with the reason on the control, not a failure
                      // on click: the count beside it already says why.
                      disabled={locked || row.products > 0 || working}
                      title={
                        locked
                          ? "The purchase-order intake writes this value, so it stays"
                          : row.products > 0
                            ? "Products still use this value"
                            : undefined
                      }
                      onClick={() => void remove(row)}
                    >
                      {working ? <Spinner /> : <Trash2 className="size-4" aria-hidden />}
                    </RowButton>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`mt-sm ${caption}`}>No {noun.one} values yet.</p>
      )}

      <div className="mt-sm flex flex-wrap items-end gap-xs">
        <div className="flex min-w-0 flex-1 flex-col gap-xxs">
          <label htmlFor={`add-${kind}`} className={label}>
            Add a {noun.one}
          </label>
          <Input
            id={`add-${kind}`}
            value={adding}
            placeholder={`New ${noun.one}`}
            onChange={(event) => setAdding(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
          />
        </div>
        <Button
          variant="secondary"
          pending={busy === "add"}
          disabled={adding.trim().length === 0}
          onClick={() => void add()}
        >
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
    </section>
  );
}

function RowButton({
  label: name,
  title,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      title={title ?? name}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-sm text-ink-secondary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:text-ink-disabled sm:size-8"
    >
      {children}
    </button>
  );
}
