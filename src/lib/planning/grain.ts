import type { Aggregation } from "@/lib/dates";

/**
 * The demand board's three grains, and the span each opens at.
 *
 * These live apart from `@/lib/queries/demand` on purpose: the toolbar is a
 * client component, and importing them from the query module pulled `prisma`
 * — and with it the whole generated client — into the browser bundle. The
 * build said so rather than shipping it, which is the good outcome, but the
 * fix is a module with no I/O in it at all.
 */
export type DemandGrain = Extract<Aggregation, "day" | "week" | "month">;

/** Months buy materials; weeks plan production; days pack lorries. */
export const DEMAND_SPAN: Record<DemandGrain, number> = { month: 6, week: 4, day: 30 };

/**
 * The most a hand-typed `?window=` may ask for, per grain.
 *
 * The chips are what the board offers; a span outside them is reachable only
 * by editing the URL, and these are where that stops being a question. Not
 * opinions about how far ahead to plan: ten years of months, five of weeks,
 * one of days already draw more columns than a screen holds, and "All open"
 * can draw more still. Past them a `?window=` is a typo, and the board falls
 * back to the grain's own default rather than answering it.
 */
export const DEMAND_CEILING: Record<DemandGrain, number> = {
  month: 120,
  week: 260,
  day: 365,
};
