/**
 * How far back the purchase-order page's stage board looks.
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
