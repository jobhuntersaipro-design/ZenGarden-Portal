"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint } from "@/lib/analytics/products";
import { formatMYR } from "@/lib/money";

export type TrendMode = "price" | "units";

function TrendTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
  mode: TrendMode;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div className="rounded-md bg-ink p-sm text-canvas shadow-sm">
      <p className="text-[length:var(--text-caption)]">
        {label} —{" "}
        {value === null || value === undefined
          ? "no sales"
          : mode === "price"
            ? formatMYR(Number(value).toFixed(2))
            : `${Math.round(Number(value))} units`}
      </p>
    </div>
  );
}

export function PriceTrendChart({
  points,
  listPrice,
  mode,
}: {
  points: PricePoint[];
  listPrice: number;
  mode: TrendMode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (next: TrendMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("trend", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const sold = points.filter((point) => point.avgBilled !== null);
  const first = sold[0]?.avgBilled ?? null;
  const last = sold[sold.length - 1]?.avgBilled ?? null;

  return (
    <section className="rounded-xl bg-surface p-xl">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Price trend
          </p>
          <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
            {first !== null && last !== null
              ? `${formatMYR(first.toFixed(2))} → ${formatMYR(last.toFixed(2))} over 12 months`
              : "No sales in the last 12 months"}
          </h2>
          <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            Months with no sales leave a gap · hover a point for the value
          </p>
        </div>

        <div className="flex overflow-hidden rounded-sm border border-hairline">
          {(
            [
              ["price", "Avg unit price"],
              ["units", "Units sold"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => select(value)}
              className={`h-control-sm px-md text-[length:var(--text-caption)] transition-colors -outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary ${
                mode === value
                  ? "bg-surface-soft font-semibold text-ink"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-lg h-72 w-full">
        <ResponsiveContainer>
          <LineChart data={points}>
            <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-ink-tertiary)", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tick={{ fill: "var(--color-ink-tertiary)", fontSize: 12 }}
            />
            <Tooltip content={<TrendTooltip mode={mode} />} />
            {/* Discounting reads as the gap between the line and the dash. */}
            {mode === "price" ? (
              <ReferenceLine
                y={listPrice}
                stroke="var(--color-brand-link)"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: `List ${formatMYR(listPrice.toFixed(2))}`,
                  position: "right",
                  fill: "var(--color-ink-tertiary)",
                  fontSize: 12,
                }}
              />
            ) : null}
            <Line
              type="linear"
              dataKey={mode === "price" ? "avgBilled" : "units"}
              stroke="var(--color-ink)"
              strokeWidth={2}
              isAnimationActive={false}
              // A month with no sales is a gap, not a drop to zero.
              connectNulls={false}
              dot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
