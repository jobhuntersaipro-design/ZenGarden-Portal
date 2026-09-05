import type { AnalyticsOrder } from "@/lib/analytics/types";

export type BuyerStatusClass = "lapsed" | "at-risk" | "new" | "active";

const DAY_MS = 24 * 60 * 60 * 1000;
const AT_RISK_FLOOR_DAYS = 14;
/**
 * "New" needs enough history behind the range to mean anything. A quarter of
 * the range is the guard: without it, "first order inside this range" cannot be
 * told from "the record starts here".
 */
const NEW_HISTORY_FRACTION = 0.25;

export type BuyerStatusInput = {
  /** This buyer's orders inside the range. */
  current: AnalyticsOrder[];
  /** Theirs in the previous period. */
  previous: AnalyticsOrder[];
  /** Every order they have ever placed. */
  history: AnalyticsOrder[];
  range: { from: Date; to: Date };
  /** The earliest PO date anywhere, which is where the record starts. */
  recordStart: Date | null;
  now?: Date;
};

const meanGapDays = (dates: Date[]): number | null => {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  let sum = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    sum += (sorted[index].getTime() - sorted[index - 1].getTime()) / DAY_MS;
  }
  return sum / (sorted.length - 1);
};

export type BuyerStatus = {
  klass: BuyerStatusClass;
  cadenceDays: number | null;
  lastOrderAt: Date | null;
  daysSilent: number | null;
  /** True when "new" could not be told apart from "no earlier data". */
  newUnknowable: boolean;
};

/**
 * One badge per buyer, first match wins — the same definitions the dashboard's
 * churn card uses, so the two screens can never disagree.
 */
export function buyerStatus({
  current,
  previous,
  history,
  range,
  recordStart,
  now = new Date(),
}: BuyerStatusInput): BuyerStatus {
  const dates = history.map((order) => order.poDate);
  const cadenceDays = meanGapDays(dates);
  const lastOrderAt =
    dates.length > 0
      ? dates.reduce((latest, date) => (date > latest ? date : latest))
      : null;
  const daysSilent =
    lastOrderAt === null
      ? null
      : Math.floor((now.getTime() - lastOrderAt.getTime()) / DAY_MS);

  const rangeSpan = range.to.getTime() - range.from.getTime();
  const historyBefore =
    recordStart === null ? 0 : range.from.getTime() - recordStart.getTime();
  const newUnknowable = historyBefore < rangeSpan * NEW_HISTORY_FRACTION;

  const base = { cadenceDays, lastOrderAt, daysSilent, newUnknowable };

  if (previous.length > 0 && current.length === 0) {
    return { ...base, klass: "lapsed" };
  }

  if (
    current.length > 0 &&
    cadenceDays !== null &&
    daysSilent !== null &&
    daysSilent >= AT_RISK_FLOOR_DAYS &&
    daysSilent > cadenceDays * 2
  ) {
    return { ...base, klass: "at-risk" };
  }

  const firstOrderAt =
    dates.length > 0
      ? dates.reduce((earliest, date) => (date < earliest ? date : earliest))
      : null;
  const firstInRange =
    firstOrderAt !== null &&
    firstOrderAt.getTime() >= range.from.getTime() &&
    firstOrderAt.getTime() <= range.to.getTime();

  // Suppressed rather than guessed: the KPI caption says why.
  if (firstInRange && !newUnknowable) return { ...base, klass: "new" };

  return { ...base, klass: "active" };
}
