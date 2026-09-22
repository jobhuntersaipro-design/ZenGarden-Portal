"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { NO_MARKET, NO_MARKET_LABEL } from "@/lib/product-markets";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/** The same styling the catalog's three selects share. */
const SELECT =
  "h-control-md sm:h-control-sm rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus";

/**
 * Market, brand and category — the three columns a product carries, and so
 * the three things the dashboard can narrow by (Phase 53 §2.2).
 *
 * They sit with the range controls rather than inside the More analytics
 * disclosure, because each one changes every figure on the page and a control
 * that does that must not be hidden behind one.
 *
 * Changing any of them clears `series`: a buyer or product chosen under one
 * market may not exist under another, and a picker offering a series the
 * chart cannot draw is the defect this project keeps fixing. The range, the
 * aggregation and the measure all survive — narrowing to a market is not a
 * reason to forget which window you were reading.
 */
export function DashboardFilters({
  markets,
  brands,
  categories,
  hasNoMarket,
  selected,
}: {
  markets: string[];
  brands: string[];
  categories: string[];
  /** Whether any line in range sits on a product carrying no market. */
  hasNoMarket: boolean;
  /**
   * What the page resolved, not what the URL said. A `?market=` naming
   * something nothing in range carries is dropped by the query, and the
   * select has to show that — or it would display a filter the figures below
   * it are not applying.
   */
  selected: { market?: string; brand?: string; category?: string };
}) {
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const write = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "") params.delete(key);
    else params.set(key, value);
    params.delete("series");
    params.delete("page");
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <>
      {/* Offered only where there is a choice to make: a dropdown holding one
          option is a label, not a filter. */}
      {markets.length > 0 && (markets.length > 1 || hasNoMarket) ? (
        <select
          aria-label="Market"
          value={selected.market ?? ""}
          onChange={(event) => write("market", event.target.value)}
          className={SELECT}
        >
          <option value="">All markets</option>
          {markets.map((market) => (
            <option key={market} value={market}>
              {market}
            </option>
          ))}
          {/* The catalog's own sentinel, so a link means the same on both
              pages. It is a named option, never a blank one. */}
          {hasNoMarket ? <option value={NO_MARKET}>{NO_MARKET_LABEL}</option> : null}
        </select>
      ) : null}

      {brands.length > 1 ? (
        <select
          aria-label="Brand"
          value={selected.brand ?? ""}
          onChange={(event) => write("brand", event.target.value)}
          className={SELECT}
        >
          <option value="">All brands</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>
      ) : null}

      {categories.length > 1 ? (
        <select
          aria-label="Category"
          value={selected.category ?? ""}
          onChange={(event) => write("category", event.target.value)}
          className={SELECT}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      ) : null}
    </>
  );
}
