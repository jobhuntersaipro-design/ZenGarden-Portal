import { PoStage } from "@/generated/prisma/enums";

/**
 * The fulfillment stages, in order. Index is meaningful: the stepper on PO
 * detail, the stacked-bar order on the dashboard and `advance` all read it.
 *
 * QC hold (Phase 67) sits between In production and QC passed and is a
 * detour, not a step: an order that passes QC first time never enters it.
 */
export const PO_STAGES = [
  PoStage.ORDER_PLACED,
  PoStage.IN_PRODUCTION,
  PoStage.QC_HOLD,
  PoStage.QC_PASSED,
  PoStage.IN_WAREHOUSE,
  PoStage.DELIVERING,
  PoStage.DELIVERED,
] as const;

const LABELS: Record<PoStage, string> = {
  ORDER_PLACED: "Order placed",
  IN_PRODUCTION: "In production",
  QC_HOLD: "QC hold",
  QC_PASSED: "Production done - QC hold",
  IN_WAREHOUSE: "QC pass - In warehouse",
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
  QC_HOLD: "--color-stage-hold",
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

/**
 * The stage `advance` moves to, or null when already delivered. In production
 * passes straight to QC passed: QC hold is reached only by `holdStage`.
 */
export function nextStage(stage: PoStage): PoStage | null {
  if (stage === PoStage.IN_PRODUCTION) return PoStage.QC_PASSED;
  const next = PO_STAGES[stageIndex(stage) + 1];
  return next ?? null;
}

/** Where QC sends an order that fails its check, or null from any other stage. */
export const holdStage = (stage: PoStage): PoStage | null =>
  stage === PoStage.IN_PRODUCTION ? PoStage.QC_HOLD : null;

/**
 * The stage a super admin's "Move back" returns to, or null at the first.
 * QC passed goes back to In production, skipping the hold: QC can put it on
 * hold again from there if that is why it came back.
 */
export function prevStage(stage: PoStage): PoStage | null {
  if (stage === PoStage.QC_PASSED || stage === PoStage.QC_HOLD) {
    return PoStage.IN_PRODUCTION;
  }
  const index = stageIndex(stage);
  return index > 0 ? PO_STAGES[index - 1] : null;
}

/**
 * The stages a buyer sees (Phase 67): In production, QC hold and In warehouse
 * are the team's own business. A real stage maps to the last buyer stage the
 * order has reached.
 */
export const BUYER_STAGES = [
  PoStage.ORDER_PLACED,
  PoStage.QC_PASSED,
  PoStage.DELIVERING,
  PoStage.DELIVERED,
] as const;

export const isBuyerStage = (stage: PoStage): boolean =>
  (BUYER_STAGES as readonly PoStage[]).includes(stage);

export function buyerStage(stage: PoStage): PoStage {
  const index = stageIndex(stage);
  return [...BUYER_STAGES].reverse().find((s) => stageIndex(s) <= index)!;
}

/** Stages already reached, inclusive — what the stepper fills in. */
export function stagesUpTo(stage: PoStage): PoStage[] {
  return PO_STAGES.slice(0, stageIndex(stage) + 1);
}
