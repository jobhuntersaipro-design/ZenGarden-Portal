import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { TIME_ZONE, type Aggregation } from "@/lib/dates";

export type Bucket = {
  /** Stable identity, `yyyy-MM-dd` of the bucket's first day in KL. */
  key: string;
  /** What the axis shows. */
  label: string;
  start: Date;
};

const toKL = (value: Date | string) =>
  new TZDate(typeof value === "string" ? new Date(value) : value, TIME_ZONE);

/**
 * Weeks start Monday, matching the rest of the app.
 *
 * Every case truncates the time. Without that on `day`, a range whose end sits
 * later in the day than its start walks one step past the last bucket and
 * emits a spurious extra one.
 */
function startOf(date: TZDate, agg: Aggregation): TZDate {
  switch (agg) {
    case "day":
      return startOfDay(date) as TZDate;
    case "week":
      return startOfWeek(date, { weekStartsOn: 1 }) as TZDate;
    case "month":
      return startOfMonth(date) as TZDate;
    case "quarter":
      return startOfQuarter(date) as TZDate;
    case "year":
      return startOfYear(date) as TZDate;
  }
}

const STEP = {
  day: addDays,
  week: addWeeks,
  month: addMonths,
  quarter: addQuarters,
  year: addYears,
} as const;

const LABEL = {
  day: "d MMM",
  week: "d MMM",
  month: "MMM yyyy",
  quarter: "QQQ yyyy",
  year: "yyyy",
} as const;

/**
 * `6–12 Jul`, or `29 Jun–5 Jul` where the week crosses a month.
 *
 * A weekly axis labelled `6 Jul` reads as Monday's takings rather than the
 * week's, and the tooltip inherits the same ambiguity. Weeks start Monday, so
 * the label names Monday through Sunday. The year is left off — the range
 * header above every chart already carries it, and the axis has no room.
 */
function weekLabel(start: TZDate): string {
  const end = addDays(start, 6);
  const sameMonth = format(start, "MMM") === format(end, "MMM");
  return `${format(start, sameMonth ? "d" : "d MMM")}–${format(end, "d MMM")}`;
}

/**
 * Which bucket a date falls in, in Kuala Lumpur. A PO confirmed at 07:00 KL
 * belongs to that day, not to the UTC day before it.
 */
export function bucketKey(value: Date | string, agg: Aggregation): string {
  return format(startOf(toKL(value), agg), "yyyy-MM-dd");
}

/**
 * Every bucket between `from` and `to`, including the ones with nothing in
 * them. A chart that skips empty buckets draws a busy week and a dead week the
 * same width, which is a lie about time.
 */
export function makeBuckets(from: Date, to: Date, agg: Aggregation): Bucket[] {
  const buckets: Bucket[] = [];
  const last = startOf(toKL(to), agg);
  let cursor = startOf(toKL(from), agg);

  // Bounded so a bad range can never spin: five years of days is the ceiling.
  for (let guard = 0; guard < 2000; guard += 1) {
    buckets.push({
      key: format(cursor, "yyyy-MM-dd"),
      // The key stays the week's first day; only the label names both ends.
      label: agg === "week" ? weekLabel(cursor) : format(cursor, LABEL[agg]),
      start: new Date(cursor.getTime()),
    });
    if (cursor.getTime() >= last.getTime()) break;
    cursor = STEP[agg](cursor, 1) as TZDate;
  }

  return buckets;
}
