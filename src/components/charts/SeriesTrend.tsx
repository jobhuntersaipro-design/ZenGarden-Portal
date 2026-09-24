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
  rotateSeriesLabels,
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

/**
 * How many chips the legend offers at once.
 *
 * The legend carries the series it is drawing *and* the ones it could draw
 * next, because a switch that removes its own way back is not a switch: click
 * Vietnam off and, if the legend listed only what is drawn, the chip would
 * vanish and the reader would have to find the picker to undo it.
 *
 * `options` can be long, though — every product sold in the range — so the
 * legend takes the drawn series plus the highest-ranked of the rest up to
 * this, and the picker above stays the whole list. The heading already reads
 * "6 of 12 products", so the reader is told what the legend is a slice of.
 */
const LEGEND_CHIPS = 10;

/**
 * How many *undrawn* chips a phone offers.
 *
 * A long product name takes a whole row at 390, so ten chips measured a 512px
 * block under a 288px chart — more legend than chart. Truncating them to fit
 * two per row was the other way out and is worse: an undrawn chip is there to
 * be *chosen*, and "500ML FINE FRA…" cannot be. So the phone keeps every
 * drawn series — switching one off must stay undoable where it happened —
 * plus a couple of spares, and the picker holds the rest. On a phone that
 * picker is the better control for choosing among twelve anyway: it is a
 * scrollable list carrying each option's ranked figure.
 */
const PHONE_SPARES = 2;

/**
 * Which series the legend offers, given everything available and what is
 * drawn.
 *
 * Two properties are the whole rule, and both are guarded:
 *
 * - **Everything drawn is included**, whatever its rank. Taking the top ten
 *   options instead would drop a selected-but-low-ranked series off the
 *   legend while the chart was still drawing its line.
 * - **The order is the options' own**, not selected-first, so switching a
 *   chip changes it in place rather than moving it across the row under the
 *   reader's finger.
 */
export function legendChips<T extends { id: string }>(
  options: readonly T[],
  selected: readonly string[],
  cap = LEGEND_CHIPS,
): T[] {
  const drawn = new Set(selected);
  const room = Math.max(0, cap - drawn.size);
  const alsoOffered = new Set(
    options
      .filter((option) => !drawn.has(option.id))
      .slice(0, room)
      .map((option) => option.id),
  );
  return options.filter(
    (option) => drawn.has(option.id) || alsoOffered.has(option.id),
  );
}

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
  /**
   * The label slots, shared out across the drawn series in slot order — so a
   * bucket carries at most one figure and any two figures are `step` apart,
   * whichever line they belong to. See `rotateSeriesLabels`.
   */
  const labelled = rotateSeriesLabels(
    slots
      .filter(Boolean)
      .map((id) => ({
        key: id,
        values: points.map((point) => Number(point[id] ?? 0)),
      })),
    labels.step,
  );

  const chips = legendChips(options, selected);
  /** The spares a phone leaves to the picker — see `PHONE_SPARES`. */
  const phoneHidden = new Set(
    chips
      .filter((option) => !slots.includes(option.id))
      .slice(PHONE_SPARES)
      .map((option) => option.id),
  );

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
                {/* The end points sit off the plot edges so their figures
                do not run into the y axis or the card. `top` is the label's
                own room above the highest point: 12px of text, 10px up. */}
                <LineChart data={points} margin={{ top: 24, right: 16 }}>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--color-hairline)"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    padding={{ left: 40, right: 24 }}
                    interval={axisInterval(points.length)}
                    tick={{
                      fill: "var(--color-ink-tertiary)",
                      fontSize: LABEL_FONT_SIZE,
                    }}
                  />
                  {/* One axis, never two: the caller picks the measure and
                  every series is drawn against it. No explicit domain either
                  — `auto` picks round ticks, and the chart's top margin is
                  what keeps the highest figure inside the plot. Pinning the
                  domain to the data plus headroom prints the headroom itself
                  as the top tick: RM 52,595 where `auto` reads RM 60,000. */}
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
                        <LabelList
                          dataKey={id}
                          content={valueLabel(
                            formatLabelValue,
                            labelled.get(id) ?? new Set<number>(),
                            10,
                          )}
                        />
                      </Line>
                    ),
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartScroller>
        )}
      </div>

      {/*
        The legend is the chart's own switch, not a key printed beside it.
        Every chip toggles its line, so the reader adds and drops series where
        they are reading them rather than reopening the picker above — which
        stays, because it ranks the options by value and holds the long tail.

        Identity is never colour alone: each chip carries its name, and a
        dropped one keeps its place in the row so the way back is where the
        chip was.
      */}
      {chips.length > 0 ? (
        <div className="mt-md">
          <ul
            aria-label="Series on this chart"
            className="flex flex-wrap gap-xs"
          >
            {chips.map((option) => {
              const slot = slots.indexOf(option.id);
              const on = slot >= 0;
              // At the cap an unselected chip still answers — with the warning
              // below rather than silence — so it is dimmed, never disabled.
              const full = !on && selected.length >= MAX_SERIES;
              /**
               * The last line on the chart cannot be switched off, and that is
               * a guard rather than a preference: an empty `?series=` reads as
               * "no choice made", so the page hands back its default and all
               * of them reappear. Switching the last one off would look like
               * switching them all on.
               */
              const onlyOne = on && selected.length === 1;
              const busy = picks.isPending(option.id);
              return (
                <li
                  key={option.id}
                  className={phoneHidden.has(option.id) ? "max-sm:hidden" : undefined}
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={onlyOne}
                    onClick={() => toggle(option.id)}
                    title={
                      onlyOne
                        ? `${option.name} is the last one — the chart keeps it`
                        : on
                          ? `Hide ${option.name}`
                          : full
                            ? capWarningText
                            : `Show ${option.name}`
                    }
                    className={`flex min-h-11 items-center gap-xxs rounded-pill border px-sm text-[length:var(--text-caption)] transition-colors focus-visible:outline-2 focus-visible:outline-focus sm:min-h-0 sm:py-xxs ${
                      on
                        ? "border-transparent bg-surface-soft text-ink"
                        : full
                          ? "border-hairline bg-canvas text-ink-disabled"
                          : "border-hairline-strong bg-canvas text-ink-tertiary hover:text-ink-secondary"
                    } ${picks.pending && !busy ? "opacity-60" : ""}`}
                  >
                    <span
                      aria-hidden
                      className={`size-2.5 shrink-0 rounded-xxs ${on ? "" : "border border-current"}`}
                      style={
                        on ? { backgroundColor: colorFor(slot) } : undefined
                      }
                    />
                    <span className="max-w-64 truncate">{option.name}</span>
                    {busy ? (
                      <Spinner className="size-3 shrink-0 text-ink-tertiary" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {capWarning ? (
            <p
              role="alert"
              className="mt-xs text-[length:var(--text-caption)] text-brand-amber"
            >
              {capWarningText}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
