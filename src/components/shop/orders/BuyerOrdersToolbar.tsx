"use client";

import { useId } from "react";
import { Search, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import {
  BUYER_ORDER_FILTER_LABELS,
  BUYER_ORDER_FILTERS,
  type BuyerOrderFilter,
} from "@/lib/buyer-order-filter";

/**
 * My orders' filter chips and search (Phase 57 J5). Both write the URL and
 * both drop `page`, so a narrower list never opens on a page it no longer has.
 * The page renders what the server resolved, not the raw URL, so the chips can
 * never show a filter the rows are not under.
 */
export function BuyerOrdersToolbar({
  filter,
  q,
}: {
  filter: BuyerOrderFilter;
  q: string;
}) {
  const chips = usePendingChoice<BuyerOrderFilter>(filter);
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = useId();

  const hrefWith = (key: "filter" | "q", value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const empty = key === "filter" ? value === "all" : value === "";
    if (empty) params.delete(key);
    else params.set(key, value);
    params.delete("page");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <div className="mb-md flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
      <div
        role="group"
        aria-label="Show"
        aria-busy={chips.pending || undefined}
        className="flex flex-wrap items-center gap-xxs"
      >
        {BUYER_ORDER_FILTERS.map((value) => (
          <ChoiceButton
            key={value}
            look="pill"
            selected={chips.value === value}
            pending={chips.isPending(value)}
            dimmed={chips.pending && !chips.isPending(value)}
            onClick={() => chips.choose(value, hrefWith("filter", value))}
          >
            {BUYER_ORDER_FILTER_LABELS[value]}
          </ChoiceButton>
        ))}
      </div>

      <form
        // Keyed on the resolved search so a cleared or changed `q` resets the
        // field rather than leaving the last thing typed in it.
        key={q}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(
            new FormData(event.currentTarget).get("q") ?? "",
          ).trim();
          replace(hrefWith("q", value));
        }}
        className="flex h-control-md items-center gap-xs rounded-pill border border-hairline-strong bg-canvas pl-md pr-xxs sm:w-80"
      >
        <Search className="size-4 shrink-0 text-ink-tertiary" aria-hidden />
        <label htmlFor={id} className="sr-only">
          Search by PO number or Order ID
        </label>
        <input
          id={id}
          name="q"
          type="search"
          defaultValue={q}
          placeholder="PO number or Order ID"
          className="min-w-0 flex-1 border-0 bg-transparent text-[length:var(--text-body-sm)] text-ink outline-none placeholder:text-ink-tertiary [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => replace(hrefWith("q", ""))}
            className="flex size-8 shrink-0 items-center justify-center rounded-pill text-ink-tertiary hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
        <button
          type="submit"
          className="flex h-8 shrink-0 items-center rounded-pill bg-ink px-md text-[length:var(--text-body-sm)] font-semibold text-canvas hover:bg-ink-deep"
        >
          Search
        </button>
      </form>
    </div>
  );
}
