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
 * The span itself is the planner's to choose — they asked for it not to be
 * boxed in at a fortnight — so these are not opinions about how far ahead to
 * plan; they are the point past which a URL is a typo rather than a question.
 * Ten years of months, five of weeks, one of days: every one of them already
 * draws more columns than a screen holds, and "All open" can draw more still.
 */
export const DEMAND_CEILING: Record<DemandGrain, number> = {
  month: 120,
  week: 260,
  day: 365,
};

/** The unit each grain counts its window in, for a label or an input's suffix. */
export const DEMAND_UNIT: Record<DemandGrain, string> = {
  month: "months",
  week: "weeks",
  day: "days",
};
