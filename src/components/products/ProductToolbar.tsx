"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import type { ProductFilter, ProductSortKey } from "@/lib/queries/products";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
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

  const chooseView = (next: ProductView) => {
    // Remembered per browser, but the URL always wins on read — a shared link
    // has to show what the sender saw.
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Private mode, or storage disabled. The URL still carries it.
    }
    write({ view: next });
  };

  const segment =
    "h-control-sm px-md text-[length:var(--text-caption)] transition-colors -outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary";

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
          <div className="flex overflow-hidden rounded-sm border border-hairline">
            {SORTS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={sortKey === option.value}
                // Writes the same ?sort= the table headers write, so the two
                // controls share one piece of state and stay in step.
                onClick={() =>
                  write({
                    sort: option.value,
                    dir: option.value === "name" ? "asc" : "desc",
                  })
                }
                className={`${segment} ${
                  sortKey === option.value
                    ? "bg-surface-soft font-semibold text-ink"
                    : "text-ink-secondary hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex overflow-hidden rounded-sm border border-hairline">
          {(
            [
              ["grid", "Grid", LayoutGrid],
              ["list", "List", List],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => chooseView(value)}
              className={`${segment} flex items-center gap-xxs ${
                view === value
                  ? "bg-surface-soft font-semibold text-ink"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex flex-wrap items-center gap-xxs">
          {CHIPS.map((chip) => {
            const active = filter === chip.value;
            return (
              <button
                key={chip.label}
                type="button"
                aria-pressed={active}
                onClick={() => write({ filter: chip.value })}
                className={`h-control-sm rounded-pill px-md text-[length:var(--text-caption)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  active
                    ? "bg-ink text-canvas"
                    : "bg-surface-soft text-ink-secondary hover:text-ink"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
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
