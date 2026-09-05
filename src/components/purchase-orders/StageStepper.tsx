import { Check } from "lucide-react";
import type { PoStage } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { PO_STAGES, stageIndex, stageLabel } from "@/lib/po-stages";

export type StageEvent = {
  toStage: PoStage;
  changedAt: string;
  changedByName: string | null;
};

/**
 * Six nodes on one track. Knows nothing about purchase orders, so the same
 * component can carry any ordered lifecycle (design reference §4).
 *
 * `current` null renders the whole thing muted — a PO that has not been
 * confirmed has not started its lifecycle.
 */
export function StageStepper({
  current,
  events,
}: {
  current: PoStage | null;
  events: StageEvent[];
}) {
  const currentIndex = current === null ? -1 : stageIndex(current);
  // The first time each stage was reached is what the caption names.
  const reached = new Map<PoStage, StageEvent>();
  for (const event of events) {
    if (!reached.has(event.toStage)) reached.set(event.toStage, event);
  }

  const filled =
    currentIndex <= 0
      ? 0
      : (currentIndex / (PO_STAGES.length - 1)) * 100;

  return (
    <div className="relative mt-lg">
      {/* Track, at node centre height, from the first node's centre to the
          last's — hence the inset of half a column on each side. */}
      <div
        aria-hidden
        className="absolute left-[8.33%] right-[8.33%] top-3 h-0.5 -translate-y-1/2 bg-hairline"
      />
      <div
        aria-hidden
        className={`absolute left-[8.33%] top-3 h-0.5 -translate-y-1/2 bg-ink ${
          currentIndex >= 0 ? "animate-stage-track" : ""
        }`}
        style={{ width: `${filled * 0.8334}%` }}
      />

      <ol className="relative grid grid-cols-6 gap-xxs">
        {PO_STAGES.map((stage, index) => {
          const done = currentIndex > index;
          const isCurrent = currentIndex === index;
          const event = reached.get(stage);

          return (
            <li key={stage} className="flex flex-col items-center gap-xxs text-center">
              <span className="relative flex size-6 items-center justify-center">
                {isCurrent ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full border-2 border-ink animate-stage-breathe"
                  />
                ) : null}
                <span
                  className={`flex size-6 items-center justify-center rounded-full ${
                    done
                      ? "bg-ink text-canvas"
                      : isCurrent
                        ? "border-2 border-ink bg-canvas"
                        : "border border-hairline-strong bg-canvas"
                  }`}
                >
                  {done ? (
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  ) : isCurrent ? (
                    <span
                      aria-hidden
                      className="size-2 rounded-full bg-ink animate-stage-dot"
                    />
                  ) : null}
                </span>
              </span>

              <span
                className={`text-[length:var(--text-body-sm)] ${
                  isCurrent
                    ? "font-semibold text-ink"
                    : done
                      ? "text-ink"
                      : "text-ink-tertiary"
                }`}
              >
                {stageLabel(stage)}
              </span>

              {/* Upcoming nodes carry no caption — there is nothing to say yet. */}
              {event && (done || isCurrent) ? (
                <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {formatDate(event.changedAt)}
                  {event.changedByName ? ` · ${event.changedByName}` : " · System"}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
