/**
 * Chart colours as CSS variable names, resolved at render time — never hex
 * literals in a component. The values live in `globals.css @theme` and these
 * are the only names a chart may reach for.
 */
export const STAGE_VARS = [
  "--color-stage-1",
  "--color-stage-2",
  "--color-stage-3",
  "--color-stage-4",
  "--color-stage-5",
  "--color-stage-6",
] as const;

/**
 * The donut palette, in fixed rank order. Deliberately a different set from the
 * stage ramp so the two cards are never read as one scale. Validated with the
 * dataviz script: worst adjacent CVD ΔE 11.0, normal-vision floor 22.6.
 *
 * Assigned by rank and never cycled — a seventh slice folds into "Other".
 *
 * These have their own `--color-share-*` names because shadcn's `@theme inline`
 * block rebinds `--color-primary` and `--color-chart-1..5` to its own tokens.
 * Reaching for either draws the chart in ink and quietly discards the palette
 * the validator signed off.
 */
export const SHARE_VARS = [
  "--color-share-1",
  "--color-share-2",
  "--color-share-3",
  "--color-share-4",
  "--color-share-5",
  "--color-share-6",
] as const;

export const OTHER_VAR = "--color-ink-disabled";

export const INTAKE_VARS = {
  confirmed: "--color-accent-green",
  needsReview: "--color-brand-amber",
  // A process running right now, and nothing else.
  extracting: "--color-accent-blue",
  failed: "--color-accent-red",
} as const;

/** The brand purple, for the line chart's two extremes. */
export const EXTREME_VAR = "--color-share-1";

export const cssVar = (name: string) => `var(${name})`;
