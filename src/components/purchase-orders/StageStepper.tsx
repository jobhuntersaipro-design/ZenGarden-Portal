import { formatDate } from "@/lib/dates";
import { PoStage } from "@/generated/prisma/enums";
import { PO_STAGES, stageLabel } from "@/lib/po-stages";
import { Stepper } from "@/components/arc/stepper/stepper";

export type StageEvent = {
  toStage: PoStage;
  changedAt: string;
  changedByName: string | null;
};

/**
 * A purchase order's six stages as Arc's stepper — markers that fill and tick
 * as a stage completes, with its own compact caption on a phone (six equal
 * columns of a phone once gave each label a 29px cell, 2026-09-06 review, A2).
 * Delivered is the last stage, so reaching it marks the whole flow complete.
 *
 * `current` null renders the whole thing muted — a PO that has not been
 * confirmed has not started its lifecycle.
 */
export function StageStepper({
  current,
  events,
  showActor,
  stages: only,
}: {
  current: PoStage | null;
  /**
   * The stages to draw. The buyer passes `BUYER_STAGES` (Phase 67); staff
   * leave it out and see every stage, QC hold only on an order that has been
   * in it — most never are, and an empty detour would read as a skipped step.
   */
  stages?: readonly PoStage[];
  events: StageEvent[];
  /**
   * Required (2026-09-24), so no caller can forget it. The buyer's query nulls
   * every actor on purpose — no staff name reaches the shop — and a null
   * actor printed as "System", telling a buyer that "System" moved their
   * order into production. The shop passes `false` and reads dates alone.
   */
  showActor: boolean;
}) {
  // The first time each stage was reached is what the caption names.
  const reached = new Map<PoStage, StageEvent>();
  for (const event of events) {
    if (!reached.has(event.toStage)) reached.set(event.toStage, event);
  }
  const list =
    only ??
    PO_STAGES.filter(
      (stage) => stage !== PoStage.QC_HOLD || current === PoStage.QC_HOLD || reached.has(stage),
    );
  const currentIndex = current === null ? -1 : list.indexOf(current);

  const stages = list.map((stage, index) => ({
    stage,
    done: currentIndex > index,
    isCurrent: currentIndex === index,
    event: reached.get(stage),
  }));

  const caption = (event: StageEvent) =>
    showActor
      ? `${formatDate(event.changedAt)}${
          event.changedByName ? ` · ${event.changedByName}` : " · System"
        }`
      : formatDate(event.changedAt);

  const delivered = currentIndex === list.length - 1;
  return (
    <div className="mt-lg">
      <Stepper
        label="Order stage"
        completeLabel="Delivered"
        current={delivered ? list.length : Math.max(0, currentIndex)}
        steps={stages.map(({ stage, done, isCurrent, event }) => ({
          id: stage,
          label: stageLabel(stage),
          description: event && (done || isCurrent) ? caption(event) : undefined,
        }))}
      />
    </div>
  );
}
