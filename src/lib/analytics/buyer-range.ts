import { TZDate } from "@date-fns/tz";
import { endOfDay, startOfDay, subMonths, subYears } from "date-fns";
import { TIME_ZONE } from "@/lib/dates";
import { firstParam, type SearchParams } from "@/lib/queries/pagination";

export type BuyerRangePreset = "3m" | "6m" | "1y" | "all";

export const BUYER_RANGES: { value: BuyerRangePreset; label: string }[] = [
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "6 months" },
  { value: "1y", label: "Last year" },
  { value: "all", label: "All time" },
];

/** Far enough back to cover any record this portal will hold. */
const ALL_TIME_FROM = new Date("2000-01-01T00:00:00Z");

export function parseBuyerRange(params: SearchParams, now: Date = new Date()) {
  const value = firstParam(params, "range") as BuyerRangePreset | undefined;
  const preset: BuyerRangePreset = BUYER_RANGES.some((r) => r.value === value)
    ? value!
    : "1y";

  const today = new TZDate(now, TIME_ZONE);
  const to = endOfDay(today) as Date;
  const from =
    preset === "all"
      ? ALL_TIME_FROM
      : (startOfDay(
          preset === "3m"
            ? subMonths(today, 3)
            : preset === "6m"
              ? subMonths(today, 6)
              : subYears(today, 1),
        ) as Date);

  return { preset, from, to };
}

/** The same length again, ending the day before `from`. */
export function buyerPreviousPeriod(range: { from: Date; to: Date }) {
  const span = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  return { from: new Date(to.getTime() - span), to };
}
