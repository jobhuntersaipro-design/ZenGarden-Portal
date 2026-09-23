/**
 * The stage board's own URL vocabulary: how far back it looks, and which
 * orders it is about.
 *
 * Its own module, and that is not tidiness. The board is a client component
 * and the page is a server one; exporting this array from the component would
 * hand the server a client reference rather than the array — `.includes` is
 * then not a function, at runtime only, with `tsc` and the whole suite clean.
 * The same defect `DEMAND_SPAN` was moved out of `queries/demand` to avoid,
 * arriving from the opposite direction.
 */
export const STAGE_WINDOWS = ["30", "60", "90"] as const;

export type StageWindow = (typeof STAGE_WINDOWS)[number];

export const DEFAULT_STAGE_WINDOW: StageWindow = "30";

/** The window the URL asked for, or the default where it named nothing real. */
export function resolveStageWindow(value: string | undefined): StageWindow {
  return STAGE_WINDOWS.includes(value as StageWindow)
    ? (value as StageWindow)
    : DEFAULT_STAGE_WINDOW;
}

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
