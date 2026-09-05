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

/** `5 Aug 2026` — the format the canvas uses in tables and headers. */
export function formatDate(value: DateInput): string {
  return format(toKL(value), "d MMM yyyy");
}

/** `5 Aug 2026, 17:05` — 24-hour, matching the Users screen. */
export function formatDateTime(value: DateInput): string {
  return format(toKL(value), "d MMM yyyy, HH:mm");
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
