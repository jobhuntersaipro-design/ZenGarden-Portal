"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { removeFamily, updateFamily } from "@/actions/product-families";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/portal/Spinner";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import type { FamilyOption } from "@/lib/queries/product-families";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * Every product family — code, name, size, how many products are in it — and
 * the two things a super admin can do to one here: edit it, or remove it once
 * it is empty (Phase 36 §4).
 *
 * Membership is deliberately not edited here. Which family a product belongs
 * to is decided on the product's own form and drawer, where its brand, size
 * and variant are in view; a family is created there too, the moment its
 * first variant is entered. This section is for the facts a family carries
 * on its own — the ones a rename should change in exactly one place.
 */
export function ProductFamilySection({ rows }: { rows: FamilyOption[] }) {
  const refresh = useAwaitableRefresh();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ code: "", name: "", size: "" });

  const startEditing = (row: FamilyOption) => {
    setEditing(row.id);
    setDraft({ code: row.code, name: row.name, size: row.size ?? "" });
  };

  const save = async (row: FamilyOption) => {
    const next = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      size: draft.size.trim() || null,
    };
    if (next.code === row.code && next.name === row.name && next.size === row.size) {
      setEditing(null);
      return;
    }
    setBusy(row.id);
    try {
      const result = await updateFamily(row.id, next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEditing(null);
      toast.success(
        result.data.code !== row.code
          ? `Saved as ${result.data.code}.`
          : `“${result.data.name}” saved.`,
      );
      await refresh();
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: FamilyOption) => {
    setBusy(row.id);
    try {
      const result = await removeFamily(row.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${row.code} removed.`);
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
          Families
        </h2>
        <p className={caption}>
          {rows.length} {rows.length === 1 ? "family" : "families"}
        </p>
      </div>
      <p className={`mt-xxs max-w-[62ch] ${caption}`}>
        A product across every market — its variants are the products. A product
        joins or leaves a family from its own page; here is where a family&rsquo;s
        code, name and size are kept.
      </p>

      {rows.length > 0 ? (
        <ul className="mt-sm divide-y divide-hairline">
          {rows.map((row) => {
            const working = busy === row.id;
            return (
              <li key={row.id} className="py-xs">
                {editing === row.id ? (
                  <div className="flex flex-wrap items-end gap-xs">
                    <div className="flex min-w-0 flex-col gap-xxs sm:w-44">
                      <label htmlFor={`family-code-${row.id}`} className={label}>
                        Code
                      </label>
                      <Input
                        id={`family-code-${row.id}`}
                        autoFocus
                        value={draft.code}
                        onChange={(event) =>
                          setDraft({ ...draft, code: event.target.value.toUpperCase() })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void save(row);
                          if (event.key === "Escape") setEditing(null);
                        }}
                        className="font-mono"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-xxs">
                      <label htmlFor={`family-name-${row.id}`} className={label}>
                        Name
                      </label>
                      <Input
                        id={`family-name-${row.id}`}
                        value={draft.name}
                        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void save(row);
                          if (event.key === "Escape") setEditing(null);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-xxs sm:w-24">
                      <label htmlFor={`family-size-${row.id}`} className={label}>
                        Size
                      </label>
                      <Input
                        id={`family-size-${row.id}`}
                        value={draft.size}
                        placeholder="2.1L"
                        onChange={(event) => setDraft({ ...draft, size: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void save(row);
                          if (event.key === "Escape") setEditing(null);
                        }}
                      />
                    </div>
                    <RowButton label={`Save ${row.code}`} onClick={() => void save(row)} disabled={working}>
                      {working ? <Spinner /> : <Check className="size-4" aria-hidden />}
                    </RowButton>
                    <RowButton label="Cancel" onClick={() => setEditing(null)} disabled={working}>
                      <X className="size-4" aria-hidden />
                    </RowButton>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-xs sm:flex-nowrap">
                    <span className="w-44 shrink-0 truncate font-mono text-[length:var(--text-body-sm)] text-ink">
                      {row.code}
                    </span>
                    <span
                      title={row.name}
                      className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink"
                    >
                      {row.name}
                      {row.size ? (
                        <span className="text-ink-tertiary"> · {row.size}</span>
                      ) : null}
                    </span>
                    {/* The count links into the catalog filtered to this family,
                        so "6 products" can be read rather than trusted. */}
                    {row.products > 0 ? (
                      <Link
                        href={`/products?family=${encodeURIComponent(row.id)}`}
                        className={`${caption} shrink-0 whitespace-nowrap text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
                      >
                        {row.products} {row.products === 1 ? "product" : "products"}
                      </Link>
                    ) : (
                      <span className={`${caption} shrink-0 whitespace-nowrap`}>No products</span>
                    )}
                    <RowButton
                      label={`Edit ${row.code}`}
                      disabled={working}
                      onClick={() => startEditing(row)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </RowButton>
                    <RowButton
                      label={`Remove ${row.code}`}
                      // Disabled with the reason on the control, not a failure
                      // on click: the count beside it already says why.
                      disabled={row.products > 0 || working}
                      title={row.products > 0 ? "Products are still in this family" : undefined}
                      onClick={() => void remove(row)}
                    >
                      {working ? <Spinner /> : <Trash2 className="size-4" aria-hidden />}
                    </RowButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`mt-sm ${caption}`}>
          No families yet. Create one from a product&rsquo;s page, or run the
          backfill script.
        </p>
      )}
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
