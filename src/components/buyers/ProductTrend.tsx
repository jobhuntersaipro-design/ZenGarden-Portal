"use client";

import { MAX_SERIES, SeriesTrend } from "@/components/charts/SeriesTrend";
import type { TrendPoint } from "@/lib/analytics/trend";
import { formatMYR } from "@/lib/money";
import { formatUnits } from "@/lib/units";

export type ProductOption = { id: string; name: string; spend: number };

/**
 * The buyer page's product trend: units per period, per product.
 *
 * Phase 53 moved the chart itself to `SeriesTrend`, which the dashboard draws
 * markets and buyers through as well. This stays as the adapter, holding the
 * strings and the formatters that make it a *product* trend — a screen's own
 * vocabulary belongs to that screen, and passing "products" down into a
 * shared component would leak it into every other one.
 *
 * Units, never money, so products of different price stay comparable. The
 * picker still ranks by spend, because spend is how a reader decides which
 * products are worth looking at.
 */
export function ProductTrend({
  points,
  products,
  slots,
  totalProducts,
}: {
  points: TrendPoint[];
  products: ProductOption[];
  slots: string[];
  totalProducts: number;
}) {
  return (
    <SeriesTrend
      points={points}
      options={products.map((product) => ({
        id: product.id,
        name: product.name,
        value: product.spend,
      }))}
      slots={slots}
      param="products"
      eyebrow="Product order trend"
      heading={`${slots.filter(Boolean).length} of ${totalProducts} products`}
      caption={`Units per period · pick up to ${MAX_SERIES} products`}
      pickerCaption={`Products bought in range · pick up to ${MAX_SERIES}`}
      capWarningText={`Up to ${MAX_SERIES} products at a time — deselect one first`}
      emptyText="Pick a product to see its trend."
      chooseLabel="Choose products"
      // "1 product selected" is the original wording for the one case the
      // name lookup can miss; pluralising it would be a new string.
      selectedLabel={(count) =>
        count === 1 ? "1 product selected" : `${count} products selected`
      }
      formatValue={(value) => `${value} units`}
      formatLabelValue={formatUnits}
      formatOption={(value) => formatMYR(value.toFixed(2))}
    />
  );
}
