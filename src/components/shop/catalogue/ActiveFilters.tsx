"use client";

import { X } from "lucide-react";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { unitLabel } from "@/lib/cartons";
import { shopQueryHref, type ShopCatalogueQuery } from "@/lib/shop-filters";

type Pill = { key: string; label: string; href: string };

function pillsFor(query: ShopCatalogueQuery): Pill[] {
  const pills: Pill[] = [];

  for (const brand of query.brands) {
    pills.push({
      key: `brand:${brand}`,
      label: brand,
      href: shopQueryHref(query, { brands: query.brands.filter((b) => b !== brand) }),
    });
  }
  for (const pack of query.packSizes) {
    pills.push({
      key: `pack:${pack}`,
      label: unitLabel(pack, "carton"),
      href: shopQueryHref(query, {
        packSizes: query.packSizes.filter((p) => p !== pack),
      }),
    });
  }
  for (const market of query.markets) {
    pills.push({
      key: `market:${market}`,
      label: market,
      href: shopQueryHref(query, { markets: query.markets.filter((m) => m !== market) }),
    });
  }
  if (query.q) {
    pills.push({
      key: "q",
      label: `“${query.q}”`,
      href: shopQueryHref(query, { q: undefined }),
    });
  }

  return pills;
}

/** The "Filtered by" row under the filter bar — shown only once something is
 * set (§5.3). *Clear all* keeps `category`: that came from the nav, not from
 * a filter the reader picked, so clearing filters does not also leave the
 * category the page happens to be titled after. */
export function ActiveFilters({ query }: { query: ShopCatalogueQuery }) {
  const { replace } = useUrlNavigation();
  const pills = pillsFor(query);
  if (pills.length === 0) return null;

  const clearAllHref = shopQueryHref(
    {
      q: undefined,
      category: query.category,
      brands: [],
      packSizes: [],
      markets: [],
      sort: "name",
      page: 1,
    },
    {},
  );

  return (
    <div className="mt-md flex flex-wrap items-center gap-xs">
      <span className="text-[length:var(--text-caption)] text-ink-tertiary">
        Filtered by
      </span>
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          onClick={() => replace(pill.href)}
          aria-label={`Remove ${pill.label} filter`}
          className="flex h-control-md items-center gap-xxs rounded-pill border border-brand-link bg-canvas pr-xs pl-sm text-[length:var(--text-caption)] font-medium text-ink sm:h-control-sm"
        >
          <span aria-hidden>{pill.label}</span>
          <span className="flex size-4 items-center justify-center rounded-pill" aria-hidden>
            <X className="size-3 text-ink-secondary" />
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => replace(clearAllHref)}
        className="ml-xxs text-[length:var(--text-caption)] font-medium text-brand-link hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
