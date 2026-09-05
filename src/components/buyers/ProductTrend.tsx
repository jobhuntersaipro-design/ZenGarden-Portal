"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SHARE_VARS, cssVar } from "@/lib/analytics/palette";
import type { ProductTrendPoint } from "@/lib/analytics/product-trend";
import { formatMYR } from "@/lib/money";

const MAX_PRODUCTS = 6;

export type ProductOption = { id: string; name: string; spend: number };

const colorFor = (index: number) => cssVar(SHARE_VARS[index % SHARE_VARS.length]);

/**
 * Colour follows the product, not its rank among the currently selected ones.
 *
 * `slots` is the assignment: an id's colour is its position in that array, and
 * a deselect blanks its slot rather than closing the gap. Packing the array
 * instead would shift every later product down one hue — deselect the first of
 * three and the other two both change colour, which is precisely the repaint
 * the spec forbids.
 */
export function ProductTrend({
  points,
  products,
  slots,
  totalProducts,
}: {
  points: ProductTrendPoint[];
  products: ProductOption[];
  slots: string[];
  totalProducts: number;
}) {
  const selected = slots.filter(Boolean);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [capWarning, setCapWarning] = useState(false);

  const write = (next: string[]) => {
    // Trailing holes carry no assignment, so they are dropped.
    const trimmed = [...next];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") trimmed.pop();

    const params = new URLSearchParams(searchParams.toString());
    if (trimmed.length === 0) params.delete("products");
    else params.set("products", trimmed.join(","));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const toggle = (id: string) => {
    const slot = slots.indexOf(id);
    if (slot >= 0) {
      setCapWarning(false);
      // Blank the slot in place: the products after it keep their colours.
      const next = [...slots];
      next[slot] = "";
      write(next);
      return;
    }
    if (selected.length >= MAX_PRODUCTS) {
      setCapWarning(true);
      return;
    }
    setCapWarning(false);
    // Reuse the first freed slot before taking a new hue.
    const free = slots.indexOf("");
    const next = [...slots];
    if (free >= 0) next[free] = id;
    else next.push(id);
    write(next);
  };

  const label =
    selected.length === 0
      ? "Choose products"
      : selected.length === 1
        ? (products.find((product) => product.id === selected[0])?.name ??
          "1 product selected")
        : `${selected.length} products selected`;

  return (
    <section className="rounded-xl bg-surface p-xl">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Product order trend
          </p>
          <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
            {selected.length} of {totalProducts} products
          </h2>
          <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            Units per period · pick up to {MAX_PRODUCTS} products
          </p>
        </div>

        <Popover onOpenChange={(open) => !open && setCapWarning(false)}>
          <PopoverTrigger className="flex h-control-md items-center gap-xs rounded-sm border border-hairline-strong bg-canvas px-sm text-[length:var(--text-body-sm)] text-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary">
            <span className="max-w-56 truncate" title={label}>
              {label}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-tertiary" aria-hidden />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-picker p-md shadow-md">
            <p
              className={`mb-xs text-[length:var(--text-caption)] ${capWarning ? "text-brand-amber" : "text-ink-tertiary"}`}
            >
              {capWarning
                ? `Up to ${MAX_PRODUCTS} products at a time — deselect one first`
                : `Products bought in range · pick up to ${MAX_PRODUCTS}`}
            </p>
            <ul className="max-h-72 overflow-y-auto">
              {products.map((product) => {
                const index = slots.indexOf(product.id);
                const checked = index >= 0;
                const full = !checked && selected.length >= MAX_PRODUCTS;
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => toggle(product.id)}
                      className={`flex w-full items-center gap-xs rounded-sm px-xs py-xxs text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary ${full ? "text-ink-disabled" : "text-ink"}`}
                    >
                      <span
                        aria-hidden
                        className="flex size-4 shrink-0 items-center justify-center rounded-xxs border border-hairline-strong"
                        style={
                          checked
                            ? {
                                backgroundColor: colorFor(index),
                                borderColor: colorFor(index),
                              }
                            : undefined
                        }
                      >
                        {checked ? (
                          <span className="text-[length:var(--text-caption)] leading-none text-canvas">
                            ✓
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)]"
                        title={product.name}
                      >
                        {product.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                        {formatMYR(product.spend.toFixed(2))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-lg h-72 w-full">
        {selected.length === 0 ? (
          <p className="py-xl text-center text-[length:var(--text-body-sm)] text-ink-secondary">
            Pick a product to see its trend.
          </p>
        ) : (
          <ResponsiveContainer>
            <LineChart data={points}>
              <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={Math.max(0, Math.ceil(points.length / 12) - 1)}
                tick={{ fill: "var(--color-ink-tertiary)", fontSize: 12 }}
              />
              {/* Units, never money, so products of different price stay
                  comparable — and one axis, never two. */}
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={40}
                tick={{ fill: "var(--color-ink-tertiary)", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-ink)",
                  border: "none",
                  borderRadius: 12,
                  color: "var(--color-canvas)",
                  fontSize: 12,
                }}
                formatter={(value, key) => [
                  `${Number(value ?? 0)} units`,
                  products.find((product) => product.id === String(key))?.name ??
                    String(key),
                ]}
              />
              {slots.map((id, index) =>
                id === "" ? null : (
                <Line
                  key={id}
                  type="linear"
                  dataKey={id}
                  stroke={colorFor(index)}
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
                />
                ),
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Identity is never colour alone. */}
      {selected.length > 0 ? (
        <ul className="mt-md flex flex-wrap gap-md">
          {slots.map((id, index) =>
            id === "" ? null : (
              <li key={id} className="flex items-center gap-xxs">
                <span
                  aria-hidden
                  className="size-2.5 rounded-xxs"
                  style={{ backgroundColor: colorFor(index) }}
                />
                <span className="text-[length:var(--text-caption)] text-ink-secondary">
                  {products.find((product) => product.id === id)?.name ?? id}
                </span>
              </li>
            ),
          )}
        </ul>
      ) : null}
    </section>
  );
}
