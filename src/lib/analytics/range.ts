import { TZDate } from "@date-fns/tz";
import { endOfDay, format, startOfDay, subDays, subMonths, subYears } from "date-fns";
import { TIME_ZONE, type Aggregation } from "@/lib/dates";
import { firstParam, type SearchParams } from "@/lib/queries/pagination";

export type RangePreset =
  | "last-day"
  | "last-30"
  | "last-60"
  | "last-3-months"
  | "last-year";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "last-day", label: "Last day" },
  { value: "last-30", label: "Last 30 days" },
  { value: "last-60", label: "Last 60 days" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "last-year", label: "Last year" },
];

export const AGGREGATIONS: { value: Aggregation; label: string; unit: string }[] = [
  { value: "day", label: "Daily", unit: "day" },
  { value: "week", label: "Weekly", unit: "week" },
  { value: "month", label: "Monthly", unit: "month" },
  { value: "quarter", label: "Quarterly", unit: "quarter" },
  { value: "year", label: "Yearly", unit: "year" },
];

export type Range = {
  from: Date;
  to: Date;
  /** The preset whose dates match exactly, or null for a custom range. */
  preset: RangePreset | null;
  agg: Aggregation;
};

const DEFAULT_PRESET: RangePreset = "last-30";

const nowKL = (now: Date) => new TZDate(now, TIME_ZONE);

/** Both ends inclusive, snapped to whole Kuala Lumpur days. */
export function presetRange(preset: RangePreset, now: Date) {
  const today = nowKL(now);
  const to = endOfDay(today) as TZDate;
  switch (preset) {
    case "last-day":
      return { from: startOfDay(today) as Date, to: to as Date };
    case "last-30":
      return { from: startOfDay(subDays(today, 29)) as Date, to: to as Date };
    case "last-60":
      return { from: startOfDay(subDays(today, 59)) as Date, to: to as Date };
    case "last-3-months":
      return { from: startOfDay(subMonths(today, 3)) as Date, to: to as Date };
    case "last-year":
      return { from: startOfDay(subYears(today, 1)) as Date, to: to as Date };
  }
}

const asDay = (value: string | undefined): Date | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new TZDate(`${value}T00:00:00`, TIME_ZONE);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * The range the whole page follows. `from`/`to` win when both are valid;
 * otherwise the preset, defaulting to Last 30 days.
 *
 * `to` is clamped to today: a range reaching into the future draws empty
 * buckets that look like a collapse in sales.
 */
export function parseRange(params: SearchParams, now: Date = new Date()): Range {
  const aggParam = firstParam(params, "agg");
  const agg = (AGGREGATIONS.find((option) => option.value === aggParam)?.value ??
    "day") as Aggregation;

  const todayEnd = endOfDay(nowKL(now)) as Date;
  const fromParam = asDay(firstParam(params, "from"));
  const toParam = asDay(firstParam(params, "to"));

  if (fromParam && toParam) {
    // A backwards range is a typo, not an instruction; swap rather than
    // returning nothing.
    const [start, end] =
      fromParam.getTime() <= toParam.getTime()
        ? [fromParam, toParam]
        : [toParam, fromParam];
    const to = new Date(
      Math.min((endOfDay(end) as Date).getTime(), todayEnd.getTime()),
    );
    const from = startOfDay(start) as Date;
    return { from, to, preset: matchPreset(from, to, now), agg };
  }

  const presetParam = firstParam(params, "preset") as RangePreset | undefined;
  const preset = RANGE_PRESETS.some((option) => option.value === presetParam)
    ? presetParam!
    : DEFAULT_PRESET;
  const { from, to } = presetRange(preset, now);
  return { from, to, preset, agg };
}

const sameDay = (a: Date, b: Date) =>
  format(new TZDate(a, TIME_ZONE), "yyyy-MM-dd") ===
  format(new TZDate(b, TIME_ZONE), "yyyy-MM-dd");

/** A chip highlights only when the dates equal its preset exactly. */
export function matchPreset(from: Date, to: Date, now: Date): RangePreset | null {
  for (const { value } of RANGE_PRESETS) {
    const candidate = presetRange(value, now);
    if (sameDay(candidate.from, from) && sameDay(candidate.to, to)) return value;
  }
  return null;
}

/** The same length again, ending the day before `from`. */
export function previousPeriod(range: { from: Date; to: Date }) {
  const span = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  return { from: new Date(to.getTime() - span), to };
}

export const rangeParams = (range: Range) => ({
  from: format(new TZDate(range.from, TIME_ZONE), "yyyy-MM-dd"),
  to: format(new TZDate(range.to, TIME_ZONE), "yyyy-MM-dd"),
});
