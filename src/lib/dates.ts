import { TZDate } from "@date-fns/tz";
import {
  endOfDay,
  format,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";

/** All bucketing happens in Malaysian time, wherever the server runs. */
export const TIME_ZONE = "Asia/Kuala_Lumpur";

export type Aggregation = "day" | "week" | "month" | "quarter" | "year";
export type RangePreset = "last-day" | "last-7" | "last-30" | "last-60" | "last-90" | "ytd";

export type DateInput = Date | string;

const toKL = (value: DateInput): TZDate =>
  new TZDate(typeof value === "string" ? new Date(value) : value, TIME_ZONE);

/**
 * `2026-09-17` for today in Kuala Lumpur — what a date input wants as its
 * value. Not `new Date().toISOString()`: between midnight and 08:00 KL that is
 * still yesterday in UTC, so a form defaulted from it pre-fills the wrong day.
 */
export function todayISO(): string {
  return format(new TZDate(new Date(), TIME_ZONE), "yyyy-MM-dd");
}

/** `5 Aug 2026` — the format the canvas uses in tables and headers. */
export function formatDate(value: DateInput): string {
  return format(toKL(value), "d MMM yyyy");
}

/** `5 Aug 2026, 17:05` — 24-hour, matching the Users screen. */
export function formatDateTime(value: DateInput): string {
  return format(toKL(value), "d MMM yyyy, HH:mm");
}

/**
 * The `[gte, lte]` bounds to filter a **date-only** column by — `poDate` is
 * `@db.Date` — from a range whose ends are Kuala Lumpur instants.
 *
 * A timestamp parameter compared against a `date` column is truncated to a UTC
 * calendar date. Midnight on 8 Aug in KL is `2026-08-07T16:00:00Z`, whose UTC
 * date is the **7th**, so `gte` admitted a whole extra day at the start of
 * every ranged query: the dashboard's KPI, summary and table counted 38 orders
 * and RM 737,667.95 while the daily chart, bucketed in KL, drew 35 and
 * RM 673,967.79. (The `to` end was always right — 23:59 KL is 15:59 UTC on the
 * same day — which is why only the opening day was ever wrong, and why the
 * weekly view appeared to agree: the extra day fell inside a bucket it drew.)
 *
 * Returning UTC midnight of each end's KL calendar day makes the truncation a
 * no-op and puts the filter on exactly the days the axis labels.
 */
export function dateColumnRange(range: { from: DateInput; to: DateInput }): {
  gte: Date;
  lte: Date;
} {
  const utcDay = (value: DateInput) =>
    new Date(`${format(toKL(value), "yyyy-MM-dd")}T00:00:00.000Z`);
  return { gte: utcDay(range.from), lte: utcDay(range.to) };
}

/** Start of the bucket `date` falls in. Weeks start Monday. */
export function bucketStart(value: DateInput, aggregation: Aggregation): Date {
  const date = toKL(value);
  switch (aggregation) {
    case "day":
      return new Date(format(date, "yyyy-MM-dd'T'00:00:00XXX"));
    case "week":
      return startOfWeek(date, { weekStartsOn: 1 });
    case "month":
      return startOfMonth(date);
    case "quarter":
      return startOfQuarter(date);
    case "year":
      return startOfYear(date);
  }
}

/**
 * Inclusive [from, to] for a dashboard preset, anchored on `now` in KL.
 * `last-30` means the last 30 days including today, matching the canvas
 * label "5 Aug 2026 – 3 Sep 2026 · 41 purchase orders".
 */
export function rangeFromPreset(
  preset: RangePreset,
  now: DateInput = new Date(),
): { from: Date; to: Date } {
  const today = toKL(now);
  const to = endOfDay(today);
  const days: Record<Exclude<RangePreset, "ytd">, number> = {
    "last-day": 1,
    "last-7": 7,
    "last-30": 30,
    "last-60": 60,
    "last-90": 90,
  };
  const from =
    preset === "ytd" ? startOfYear(today) : subDays(today, days[preset] - 1);
  return { from: new Date(format(from, "yyyy-MM-dd'T'00:00:00XXX")), to };
}
