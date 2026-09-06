"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import type { ProductFilter, ProductSortKey } from "@/lib/queries/products";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

export type ProductView = "grid" | "list";

const VIEW_STORAGE_KEY = "products.view";

const CHIPS: { value: ProductFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "missing-image", label: "Missing image" },
  { value: "inactive", label: "Inactive" },
  { value: "price-moved", label: "Price moved > 3%" },
  { value: "not-sold-60d", label: "Not sold in 60 days" },
];

const SORTS: { value: ProductSortKey; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "units", label: "Units" },
  { value: "drift", label: "Drift" },
  { value: "listPrice", label: "Price" },
  { value: "name", label: "Name" },
];

const SEARCH_DEBOUNCE_MS = 200;

export function ProductToolbar({
  view,
  filter,
  sortKey,
  summary,
}: {
  view: ProductView;
  filter: ProductFilter;
  sortKey: ProductSortKey;
  summary: string;
}) {
  const { replace } = useUrlNavigation();
  // One transition per group, so a chip click never spins the sort strip.
  const filters = usePendingChoice<ProductFilter>(filter);
  const sorts = usePendingChoice<ProductSortKey>(sortKey);
  const views = usePendingChoice<ProductView>(view);
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
            className="h-control-sm w-72 pl-xl"
          />
        </div>

        <select
          aria-label="Category"
          value={searchParams.get("category") ?? ""}
          onChange={(event) => write({ category: event.target.value })}
          className="h-control-sm rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <option value="">All categories</option>
          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-xs">
          <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Sort
          </span>
          <div
            className="flex overflow-hidden rounded-sm border border-hairline"
            aria-busy={sorts.pending || undefined}
          >
            {SORTS.map((option) => (
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
          </div>
        </div>

        <div
          className="ml-auto flex overflow-hidden rounded-sm border border-hairline"
          aria-busy={views.pending || undefined}
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
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div
          className="flex flex-wrap items-center gap-xxs"
          aria-busy={filters.pending || undefined}
        >
          {CHIPS.map((chip) => (
            <ChoiceButton
              key={chip.label}
              look="pill"
              compact
              selected={filters.value === chip.value}
              pending={filters.isPending(chip.value)}
              dimmed={filters.pending && !filters.isPending(chip.value)}
              onClick={() => filters.choose(chip.value, hrefFor({ filter: chip.value }))}
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
