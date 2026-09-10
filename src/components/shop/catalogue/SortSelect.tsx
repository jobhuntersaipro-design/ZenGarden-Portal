"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import {
  SHOP_SORTS,
  shopQueryHref,
  type ShopCatalogueQuery,
  type ShopSort,
} from "@/lib/shop-filters";

const SORT_LABELS: Record<ShopSort, string> = {
  name: "Name",
  "price-asc": "Price, low to high",
  "price-desc": "Price, high to low",
};

/** The right-hand chip on the filter row (§5.3). Never itself a facet: the
 * URL carries `sort` and does not reset the page or count towards "Filtered
 * by" the way a facet selection does. */
export function SortSelect({ query }: { query: ShopCatalogueQuery }) {
  const { replace } = useUrlNavigation();

  return (
    <Select
      value={query.sort}
      onValueChange={(value) => replace(shopQueryHref(query, { sort: value as ShopSort }))}
    >
      <SelectTrigger
        aria-label="Sort products"
        className="h-control-md gap-xs rounded-pill border-hairline-strong px-md text-[length:var(--text-body-sm)] hover:border-ink sm:h-control-sm"
      >
        <span className="text-ink-tertiary">Sort</span>
        <SelectValue>
          <span className="font-semibold text-ink">{SORT_LABELS[query.sort]}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" position="popper">
        {SHOP_SORTS.map((sort) => (
          <SelectItem key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
