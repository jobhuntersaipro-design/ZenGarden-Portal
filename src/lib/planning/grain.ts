import type { Aggregation } from "@/lib/dates";

/**
 * The demand board's two grains, and the span each opens at.
 *
 * These live apart from `@/lib/queries/demand` on purpose: the toolbar is a
 * client component, and importing them from the query module pulled `prisma`
 * — and with it the whole generated client — into the browser bundle. The
 * build said so rather than shipping it, which is the good outcome, but the
 * fix is a module with no I/O in it at all.
 */
export type DemandGrain = Extract<Aggregation, "day" | "week">;

/** Weeks plan production; days pack lorries. */
export const DEMAND_SPAN: Record<DemandGrain, number> = { week: 4, day: 14 };
