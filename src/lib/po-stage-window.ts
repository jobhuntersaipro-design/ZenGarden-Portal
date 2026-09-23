/**
 * The stage board's own URL vocabulary: which orders it is about.
 *
 * Nothing about *how far back* lives here any more. The toolbar above the
 * board owns the grain and the span for both boards on the page, so a second
 * window control would have been one question asked twice with two answers.
 *
 * Its own module, and that is not tidiness. The board is a client component
 * and the page is a server one; exporting this array from the component would
 * hand the server a client reference rather than the array — `.includes` is
 * then not a function, at runtime only, with `tsc` and the whole suite clean.
 * The same defect `DEMAND_SPAN` was moved out of `queries/demand` to avoid,
 * arriving from the opposite direction.
 */

/**
 * Which open orders the board counts.
 *
 * `overdue` narrows **everything** — the bars, the legend and the table —
 * rather than merely highlighting: a chart of all sixty orders under a
 * heading that says twelve is the defect `context/lessons.md` §1 records, and
 * one control that narrows one half of a card is how it happens. It is
 * applied in exactly one place, `openAt`, which every figure walks.
 */
export const STAGE_SHOWS = ["all", "overdue"] as const;

export type StageShowParam = (typeof STAGE_SHOWS)[number];

export const DEFAULT_STAGE_SHOW: StageShowParam = "all";

/** What the URL asked for, or everything where it named nothing real. */
export function resolveStageShow(value: string | undefined): StageShowParam {
  return STAGE_SHOWS.includes(value as StageShowParam)
    ? (value as StageShowParam)
    : DEFAULT_STAGE_SHOW;
}
