"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisInterval,
  CHART_ANIMATION,
  LABEL_FONT_SIZE,
  labelledIndices,
  useLabelStep,
  valueLabel,
} from "@/components/charts/labels";
import { ChartScroller } from "@/components/charts/ChartScroller";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SHARE_VARS, cssVar } from "@/lib/analytics/palette";
import type { TrendPoint } from "@/lib/analytics/trend";
import { Spinner } from "@/components/portal/Spinner";
import { usePendingChoice } from "@/hooks/usePendingChoice";

/**
 * Six, because `SHARE_VARS` holds six hues the dataviz validator signed off
 * and the rule since Phase 06 is that a seventh folds rather than cycles.
 */
export const MAX_SERIES = 6;

export type SeriesOption = { id: string; name: string; value: number };

const colorFor = (index: number) =>
  cssVar(SHARE_VARS[index % SHARE_VARS.length]);

/**
 * Colour follows the series, not its rank among the currently selected ones.
 *
 * `slots` is the assignment: an id's colour is its position in that array, and
 * a deselect blanks its slot rather than closing the gap. Packing the array
 * instead would shift every later series down one hue — deselect the first of
 * three and the other two both change colour, which is precisely the repaint
 * the spec forbids.
 *
 * Generalised out of the buyer page's product trend in Phase 53 so the
 * dashboard can draw markets, buyers and products through the same picker,
 * the same colour rule and the same axis. Every string is a prop: this
 * component knows it is drawing series, and nothing about what they are.
 */
export function SeriesTrend({
  points,
  options,
  slots,
  eyebrow,
  heading,
  caption,
  pickerCaption,
  capWarningText,
  emptyText,
  chooseLabel,
  selectedLabel,
  param,
  formatValue,
  formatLabelValue,
  formatOption,
  yAxisWidth = 40,
  yTickFormatter,
  labelPoints = true,
  header,
}: {
  points: TrendPoint[];
  options: SeriesOption[];
  slots: string[];
  eyebrow: string;
  heading: string;
  caption: string;
  pickerCaption: string;
  capWarningText: string;
  emptyText: string;
  /** The picker's own label when nothing is selected. */
  chooseLabel: string;
  /** Its label at two or more, e.g. `(n) => `${n} products selected``. */
  selectedLabel: (count: number) => string;
  /** The search param this writes its slots to. */
  param: string;
  /** The tooltip's figure. */
  formatValue: (value: number) => string;
  /** The figure beside a point, and what the label spacing is measured on. */
  formatLabelValue: (value: number) => string;
  /** The ranked figure in the picker's own rows. */
  formatOption: (value: number) => string;
  yAxisWidth?: number;
  yTickFormatter?: (value: number) => string;
  /**
   * Whether to print the figure beside each point. `useLabelStep` spaces
   * labels along *one* series; with several drawn they collide across series
   * instead, which a browser drive caught at three markets over thirty daily
   * buckets (RM 5,206 printed over RM 5,183). A caller drawing more than one
   * line turns them off and leaves the tooltip to answer the value.
   */
  labelPoints?: boolean;
  /** An extra control in the header — the dashboard's subject switch. */
  header?: React.ReactNode;
}) {
  const selected = slots.filter(Boolean);
  // Which row was toggled, so it alone spins until the chart has caught up.
  const picks = usePendingChoice<string>("");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [capWarning, setCapWarning] = useState(false);
  const longest = points.reduce(
    (max, point) =>
      selected.reduce(
        (inner, id) =>
          Math.max(inner, formatLabelValue(Number(point[id] ?? 0)).length),
        max,
      ),
    0,
  );
  const labels = useLabelStep(points.length, longest);

  const write = (next: string[], id: string) => {
    // Trailing holes carry no assignment, so they are dropped.
    const trimmed = [...next];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "")
      trimmed.pop();

    const params = new URLSearchParams(searchParams.toString());
    if (trimmed.length === 0) params.delete(param);
    else params.set(param, trimmed.join(","));
    picks.choose(id, `${pathname}?${params.toString()}`);
  };

  const toggle = (id: string) => {
    const slot = slots.indexOf(id);
    if (slot >= 0) {
      setCapWarning(false);
      // Blank the slot in place: the series after it keep their colours.
      const next = [...slots];
      next[slot] = "";
      write(next, id);
      return;
    }
    if (selected.length >= MAX_SERIES) {
      setCapWarning(true);
      return;
    }
    setCapWarning(false);
    // Reuse the first freed slot before taking a new hue.
    const free = slots.indexOf("");
    const next = [...slots];
    if (free >= 0) next[free] = id;
    else next.push(id);
    write(next, id);
  };

  const label =
    selected.length === 0
      ? chooseLabel
      : selected.length === 1
        ? (options.find((option) => option.id === selected[0])?.name ??
          selectedLabel(1))
        : selectedLabel(selected.length);

  return (
    <section className="rounded-xl bg-surface p-xl">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            {eyebrow}
          </p>
          <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
            {heading}
          </h2>
          <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            {caption}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-sm">
        {header}
        <Popover onOpenChange={(open) => !open && setCapWarning(false)}>
          <PopoverTrigger className="flex h-control-md items-center gap-xs rounded-sm border border-hairline-strong bg-canvas px-sm text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus">
            <span className="max-w-56 truncate" title={label}>
              {label}
            </span>
            <ChevronsUpDown
              className="size-4 shrink-0 text-ink-tertiary"
              aria-hidden
            />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-picker p-md shadow-md">
            <p
              className={`mb-xs text-[length:var(--text-caption)] ${capWarning ? "text-brand-amber" : "text-ink-tertiary"}`}
            >
              {capWarning ? capWarningText : pickerCaption}
            </p>
            <ul className="max-h-72 overflow-y-auto">
              {options.map((product) => {
                const index = slots.indexOf(product.id);
                const checked = index >= 0;
                const full = !checked && selected.length >= MAX_SERIES;
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => toggle(product.id)}
                      className={`flex w-full items-center gap-xs rounded-sm px-xs py-xxs text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus ${full ? "text-ink-disabled" : "text-ink"}`}
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
                      {picks.isPending(product.id) ? (
                        <Spinner className="size-3 text-ink-tertiary" />
                      ) : null}
                      <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                        {formatOption(product.value)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
        </div>
      </div>

      <div className="mt-lg">
        {selected.length === 0 ? (
          <p className="py-xl text-center text-[length:var(--text-body-sm)] text-ink-secondary">
            {emptyText}
          </p>
        ) : (
          <ChartScroller
            buckets={points.length}
            labels={points.map((point) => point.label)}
            axisWidth={128}
            fade="surface"
          >
            <div className="h-72 w-full">
              <ResponsiveContainer onResize={labels.onResize}>
                <LineChart data={points} margin={{ top: 16, right: 16 }}>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--color-hairline)"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    padding={{ left: 24, right: 24 }}
                    interval={axisInterval(points.length)}
                    tick={{
                      fill: "var(--color-ink-tertiary)",
                      fontSize: LABEL_FONT_SIZE,
                    }}
                  />
                  {/* One axis, never two: the caller picks the measure and
                  every series is drawn against it. */}
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={yAxisWidth}
                    tickFormatter={yTickFormatter}
                    tick={{
                      fill: "var(--color-ink-tertiary)",
                      fontSize: LABEL_FONT_SIZE,
                    }}
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
                      formatValue(Number(value ?? 0)),
                      options.find((option) => option.id === String(key))
                        ?.name ?? String(key),
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
                        {...CHART_ANIMATION}
                        dot={{
                          r: 4,
                          strokeWidth: 2,
                          stroke: "var(--color-surface)",
                        }}
                      >
                        {labelPoints ? (
                        <LabelList
                          dataKey={id}
                          content={valueLabel(
                            formatLabelValue,
                            labelledIndices(
                              points.map((point) => Number(point[id] ?? 0)),
                              labels.step,
                            ),
                            10,
                          )}
                        />
                        ) : null}
                      </Line>
                    ),
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartScroller>
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
                  {options.find((option) => option.id === id)?.name ?? id}
                </span>
              </li>
            ),
          )}
        </ul>
      ) : null}
    </section>
  );
}
