import type { PoStage } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { PO_STAGES, stageIndex, stageLabel } from "@/lib/po-stages";
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
}: {
  current: PoStage | null;
  events: StageEvent[];
  /**
   * Required (2026-09-24), so no caller can forget it. The buyer's query nulls
   * every actor on purpose — no staff name reaches the shop — and a null
   * actor printed as "System", telling a buyer that "System" moved their
   * order into production. The shop passes `false` and reads dates alone.
   */
  showActor: boolean;
}) {
  const currentIndex = current === null ? -1 : stageIndex(current);
  // The first time each stage was reached is what the caption names.
  const reached = new Map<PoStage, StageEvent>();
  for (const event of events) {
    if (!reached.has(event.toStage)) reached.set(event.toStage, event);
  }

  const stages = PO_STAGES.map((stage, index) => ({
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

  const delivered = currentIndex === PO_STAGES.length - 1;
  return (
    <div className="mt-lg">
      <Stepper
        label="Order stage"
        completeLabel="Delivered"
        current={delivered ? PO_STAGES.length : Math.max(0, currentIndex)}
        steps={stages.map(({ stage, done, isCurrent, event }) => ({
          id: stage,
          label: stageLabel(stage),
          description: event && (done || isCurrent) ? caption(event) : undefined,
        }))}
      />
    </div>
  );
}
