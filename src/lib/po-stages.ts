import { PoStage } from "@/generated/prisma/enums";

/**
 * The six fulfillment stages, in order. Index is meaningful: the stepper on
 * PO detail, the stacked-bar order on the dashboard and `advance` all read it.
 */
export const PO_STAGES = [
  PoStage.ORDER_PLACED,
  PoStage.IN_PRODUCTION,
  PoStage.QC_PASSED,
  PoStage.IN_WAREHOUSE,
  PoStage.DELIVERING,
  PoStage.DELIVERED,
] as const;

const LABELS: Record<PoStage, string> = {
  ORDER_PLACED: "Order placed",
  IN_PRODUCTION: "In production",
  QC_PASSED: "QC passed",
  IN_WAREHOUSE: "In warehouse",
  DELIVERING: "Delivering",
  DELIVERED: "Delivered",
};

/**
 * Categorical palette token per stage. Fills, dots and legend swatches only —
 * never text (design reference, "Stage palette").
 */
const COLOR_VARS: Record<PoStage, string> = {
  ORDER_PLACED: "--color-stage-1",
  IN_PRODUCTION: "--color-stage-2",
  QC_PASSED: "--color-stage-3",
  IN_WAREHOUSE: "--color-stage-4",
  DELIVERING: "--color-stage-5",
  DELIVERED: "--color-stage-6",
};

/** Sentence case, per the design conventions. */
export const stageLabel = (stage: PoStage): string => LABELS[stage];

export const stageColorVar = (stage: PoStage): string => COLOR_VARS[stage];

export const stageIndex = (stage: PoStage): number => PO_STAGES.indexOf(stage);

export const isFinalStage = (stage: PoStage): boolean =>
  stage === PoStage.DELIVERED;

/** The stage `advance` moves to, or null when already delivered. */
export function nextStage(stage: PoStage): PoStage | null {
  const next = PO_STAGES[stageIndex(stage) + 1];
  return next ?? null;
}

/** Stages already reached, inclusive — what the stepper fills in. */
export function stagesUpTo(stage: PoStage): PoStage[] {
  return PO_STAGES.slice(0, stageIndex(stage) + 1);
}
