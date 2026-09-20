"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FAMILY_SORT_KEYS, type FamilySortKey } from "@/lib/product-families";
import type { ProductFilter, ProductSortKey } from "@/lib/queries/products";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

export type ProductView = "grid" | "list";

/** Rows are products, or rows are families (Phase 36). */
export type ProductBy = "product" | "family";

const VIEW_STORAGE_KEY = "products.view";

const CHIPS: { value: ProductFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "needs-review", label: "Needs review" },
  { value: "missing-image", label: "Missing image" },
  // The key stays `inactive` on purpose: a saved link must keep working, and
  // the column behind it is still `Product.active` (Phase 28 §3).
  { value: "inactive", label: "Unpublished" },
  { value: "price-moved", label: "Price moved > 3%" },
  { value: "not-sold-60d", label: "Not sold in 60 days" },
  // Counted and running out. A product nobody has counted is not in here —
  // see `needsAttention`.
  { value: "low-stock", label: "Low stock" },
];

const SORTS: { value: ProductSortKey; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "units", label: "Units" },
  { value: "drift", label: "Drift" },
  { value: "listPrice", label: "Price" },
  { value: "stock", label: "Stock" },
  { value: "name", label: "Name" },
];

const SEARCH_DEBOUNCE_MS = 200;

export function ProductToolbar({
  view,
  by,
  familyChip,
  filter,
  sortKey,
  summary,
  brands,
  categories,
}: {
  view: ProductView;
  by: ProductBy;
  /** Set while the product view is filtered to one family: what it says. */
  familyChip: string | null;
  filter: ProductFilter;
  sortKey: ProductSortKey | FamilySortKey;
  summary: string;
  /** Every brand on a product, for the filter; the page derives it from the rows. */
  brands: string[];
  /** Every category in use, derived the same way — the list is no longer fixed. */
  categories: string[];
}) {
  const { replace } = useUrlNavigation();
  // One transition per group, so a chip click never spins the sort strip.
  const filters = usePendingChoice<ProductFilter>(filter);
  const sorts = usePendingChoice<ProductSortKey | FamilySortKey>(sortKey);
  const views = usePendingChoice<ProductView>(view);
  const bys = usePendingChoice<ProductBy>(by);
  const byFamily = by === "family";
  // The family rows sort on fewer things: no list price, no drift.
  const sortOptions = byFamily
    ? SORTS.filter((option) => (FAMILY_SORT_KEYS as readonly string[]).includes(option.value))
    : SORTS;
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

  const hrefFor = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    return params.toString() ? `${pathname}?${params.toString()}` : pathname;
  };
  const write = (next: Record<string, string | null>) => replace(hrefFor(next));

  const chooseView = (next: ProductView) => {
    // Remembered per browser, but the URL always wins on read — a shared link
    // has to show what the sender saw.
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Private mode, or storage disabled. The URL still carries it.
    }
    views.choose(next, hrefFor({ view: next }));
  };

  return (
    <div className="mb-lg flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-xs top-1/2 size-4 -translate-y-1/2 text-ink-tertiary"
          />
          <Input
            aria-label="Search products"
            placeholder="Name or SKU…"
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

        {/* Only offered once there is more than one brand to choose between;
            a dropdown with a single option is a label, not a filter. */}
        {brands.length > 1 ? (
          <select
            aria-label="Brand"
            value={searchParams.get("brand") ?? ""}
            onChange={(event) => write({ brand: event.target.value })}
            className="h-control-md sm:h-control-sm rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus"
          >
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        ) : null}

        <select
          aria-label="Category"
          value={searchParams.get("category") ?? ""}
          onChange={(event) => write({ category: event.target.value })}
          className="h-control-md sm:h-control-sm rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        {/* Products or families — the two things the catalog can be a list
            of. The sort is dropped on the way across, since the keys differ;
            the family filter too, because it only means something to rows
            that are products. */}
        <SegmentGroup label="By" busy={bys.pending}>
          {(
            [
              ["product", "Products"],
              ["family", "Families"],
            ] as const
          ).map(([value, text]) => (
            <ChoiceButton
              key={value}
              look="segment"
              selected={bys.value === value}
              pending={bys.isPending(value)}
              dimmed={bys.pending && !bys.isPending(value)}
              onClick={() =>
                bys.choose(
                  value,
                  hrefFor({
                    by: value === "family" ? "family" : null,
                    sort: null,
                    dir: null,
                    family: null,
                    filter: null,
                  }),
                )
              }
            >
              {text}
            </ChoiceButton>
          ))}
        </SegmentGroup>

        <SegmentGroup label="Sort" busy={sorts.pending}>
          {sortOptions.map((option) => (
            <ChoiceButton
              key={option.value}
              look="segment"
              selected={sorts.value === option.value}
              pending={sorts.isPending(option.value)}
              dimmed={sorts.pending && !sorts.isPending(option.value)}
              // Writes the same ?sort= the table headers write, so the two
              // controls share one piece of state and stay in step.
              onClick={() =>
                sorts.choose(
                  option.value,
                  hrefFor({
                    sort: option.value,
                    dir: option.value === "name" ? "asc" : "desc",
                  }),
                )
              }
            >
              {option.label}
            </ChoiceButton>
          ))}
        </SegmentGroup>

        {byFamily ? null : (
        <SegmentGroup
          label="View"
          hideLabel
          busy={views.pending}
          className="ml-auto"
        >
          {(
            [
              ["grid", "Grid", LayoutGrid],
              ["list", "List", List],
            ] as const
          ).map(([value, label, Icon]) => (
            <ChoiceButton
              key={value}
              look="segment"
              selected={views.value === value}
              pending={views.isPending(value)}
              dimmed={views.pending && !views.isPending(value)}
              onClick={() => chooseView(value)}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </ChoiceButton>
          ))}
        </SegmentGroup>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div
          className="flex flex-wrap items-center gap-xxs"
          aria-busy={filters.pending || undefined}
        >
          {/* The family the product view is narrowed to, with the one way
              out. It reads as a filter because it is one; it is not among
              the chips because it is never chosen from here. */}
          {familyChip ? (
            <button
              type="button"
              onClick={() => write({ family: null, page: null })}
              className="inline-flex min-h-control-md items-center gap-xxs rounded-pill border border-ink bg-ink px-sm text-[length:var(--text-body-sm)] text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-control-sm"
            >
              {familyChip}
              <X className="size-3.5" aria-hidden />
              <span className="sr-only">Clear the family filter</span>
            </button>
          ) : null}
          {byFamily ? null : CHIPS.map((chip) => (
            <ChoiceButton
              key={chip.label}
              look="pill"
              compact
              selected={filters.value === chip.value}
              pending={filters.isPending(chip.value)}
              dimmed={filters.pending && !filters.isPending(chip.value)}
              onClick={() =>
                filters.choose(chip.value, hrefFor({ filter: chip.value }))
              }
            >
              {chip.label}
            </ChoiceButton>
          ))}
        </div>
        {/* Says which set it describes, because the KPI row above describes
            a different one whenever a filter is on. */}
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {summary}
          {/* The summary claims a count and a total. While the server is
              recomputing them that claim is stale, so it says so here rather
              than letting the figures move under the reader (brief G1). */}
          <UpdatingHint />
        </p>
      </div>
    </div>
  );
}

/** Read on the client only; the server has no access to localStorage. */
export function readStoredView(): ProductView | null {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "grid" || stored === "list" ? stored : null;
  } catch {
    return null;
  }
}
