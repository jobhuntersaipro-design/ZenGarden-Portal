"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SortSelect } from "@/components/shop/catalogue/SortSelect";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { unitLabel } from "@/lib/cartons";
import { shopQueryHref, type ShopCatalogueQuery } from "@/lib/shop-filters";
import type { Facet } from "@/lib/queries/shop-catalogue";

function toggled<T>(selected: T[], value: T): T[] {
  return selected.includes(value)
    ? selected.filter((v) => v !== value)
    : [...selected, value];
}

/**
 * One facet chip: label, a count badge once something is ticked, and a
 * `Popover` of `Checkbox` rows each carrying its own "what would I get if I
 * also ticked this" count (§5.3). A facet with no values renders nothing —
 * the caller checks that, not this component, since "render nothing" still
 * has to skip the `Popover` itself.
 */
function FacetChip<T extends string | number>({
  label,
  values,
  selected,
  format,
  onToggle,
}: {
  label: string;
  values: Facet<T>;
  selected: T[];
  format: (value: T) => string;
  onToggle: (value: T) => void;
}) {
  const active = selected.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-control-md items-center gap-xs rounded-pill border px-md text-[length:var(--text-body-sm)] sm:h-control-sm",
            active
              ? "border-ink bg-surface font-semibold text-ink"
              : "border-hairline-strong bg-canvas text-ink hover:border-ink",
          )}
        >
          <span>{label}</span>
          {active ? (
            <span className="flex size-4 items-center justify-center rounded-pill bg-ink text-[length:var(--text-caption)] font-semibold text-canvas">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="gap-0 p-xs shadow-sm">
        <div className="flex max-h-72 flex-col overflow-y-auto">
          {values.map((entry) => {
            const checked = selected.includes(entry.value);
            return (
              <label
                key={entry.value}
                className="flex min-h-control-md items-center gap-sm rounded-sm px-sm hover:bg-surface sm:min-h-control-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(entry.value)}
                />
                <span className="flex-1 text-[length:var(--text-body-sm)] text-ink">
                  {format(entry.value)}
                </span>
                <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {entry.count}
                </span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({
  query,
  facets,
}: {
  query: ShopCatalogueQuery;
  facets: { brands: Facet<string>; packSizes: Facet<number>; markets: Facet<string> };
}) {
  const { replace } = useUrlNavigation();

  const go = (over: Partial<ShopCatalogueQuery>) => replace(shopQueryHref(query, over));

  return (
    <div className="flex flex-wrap items-center gap-sm">
      {facets.brands.length > 0 ? (
        <FacetChip
          label="Brand"
          values={facets.brands}
          selected={query.brands}
          format={(value) => value}
          onToggle={(value) => go({ brands: toggled(query.brands, value) })}
        />
      ) : null}
      {facets.packSizes.length > 0 ? (
        <FacetChip
          label="Pack size"
          values={facets.packSizes}
          selected={query.packSizes}
          format={(value) => unitLabel(value, "carton")}
          onToggle={(value) => go({ packSizes: toggled(query.packSizes, value) })}
        />
      ) : null}
      {facets.markets.length > 0 ? (
        <FacetChip
          label="Market"
          values={facets.markets}
          selected={query.markets}
          format={(value) => value}
          onToggle={(value) => go({ markets: toggled(query.markets, value) })}
        />
      ) : null}
      <div className="flex-1" />
      <SortSelect query={query} />
    </div>
  );
}
