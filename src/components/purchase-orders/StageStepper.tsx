import { Check } from "lucide-react";
import type { PoStage } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { PO_STAGES, stageIndex, stageLabel } from "@/lib/po-stages";

export type StageEvent = {
  toStage: PoStage;
  changedAt: string;
  changedByName: string | null;
};

/** The dot, identical in both orientations. */
function StageNode({ done, isCurrent }: { done: boolean; isCurrent: boolean }) {
  return (
    <span className="relative z-10 flex size-6 shrink-0 items-center justify-center">
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
  );
}

function labelClass(done: boolean, isCurrent: boolean) {
  return `text-[length:var(--text-body-sm)] ${
    isCurrent
      ? "font-semibold text-ink"
      : done
        ? "text-ink"
        : "text-ink-tertiary"
  }`;
}

/**
 * Six nodes on one track. Knows nothing about purchase orders, so the same
 * component can carry any ordered lifecycle (design reference §4).
 *
 * `current` null renders the whole thing muted — a PO that has not been
 * confirmed has not started its lifecycle.
 *
 * Two orientations. The horizontal track is the canvas layout and holds from
 * `sm` up; below that it turns vertical. Six equal columns of a phone gave each
 * stage a 29px cell for a 48–73px label, so every label overflowed into both
 * its neighbours and the row rendered as "Ipeodductpiassveedhouse"
 * (2026-09-06 review, A2). Only one orientation is ever displayed, so only one
 * reaches the accessibility tree.
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
    currentIndex <= 0 ? 0 : (currentIndex / (PO_STAGES.length - 1)) * 100;

  const stages = PO_STAGES.map((stage, index) => ({
    stage,
    index,
    done: currentIndex > index,
    isCurrent: currentIndex === index,
    event: reached.get(stage),
  }));

  const caption = (event: StageEvent) =>
    `${formatDate(event.changedAt)}${
      event.changedByName ? ` · ${event.changedByName}` : " · System"
    }`;

  return (
    <div className="mt-lg">
      {/* Vertical, below `sm`. The connector runs from each node to the next,
          so the last row has none. */}
      <ol className="flex flex-col sm:hidden">
        {stages.map(({ stage, index, done, isCurrent, event }) => (
          <li key={stage} className="relative flex gap-sm pb-md last:pb-0">
            {index < stages.length - 1 ? (
              <span
                aria-hidden
                // `left-3` is the node's centre (half of size-6).
                className={`absolute top-6 bottom-0 left-3 w-0.5 -translate-x-1/2 ${
                  done ? "bg-ink" : "bg-hairline"
                }`}
              />
            ) : null}
            <StageNode done={done} isCurrent={isCurrent} />
            <div className="min-w-0 flex-1">
              <p className={labelClass(done, isCurrent)}>{stageLabel(stage)}</p>
              {/* Upcoming nodes carry no caption — there is nothing to say yet. */}
              {event && (done || isCurrent) ? (
                <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {caption(event)}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {/* Horizontal, from `sm` up. */}
      <div className="relative hidden sm:block">
        {/* Track, at node centre height, from the first node's centre to the
            last's — hence the inset of half a column on each side. */}
        <div
          aria-hidden
          className="absolute top-3 right-[8.33%] left-[8.33%] h-0.5 -translate-y-1/2 bg-hairline"
        />
        <div
          aria-hidden
          className={`absolute top-3 left-[8.33%] h-0.5 -translate-y-1/2 bg-ink ${
            currentIndex >= 0 ? "animate-stage-track" : ""
          }`}
          style={{ width: `${filled * 0.8334}%` }}
        />

        <ol className="relative grid grid-cols-6 gap-xxs">
          {stages.map(({ stage, done, isCurrent, event }) => (
            <li
              key={stage}
              className="flex flex-col items-center gap-xxs text-center"
            >
              <StageNode done={done} isCurrent={isCurrent} />
              <span className={labelClass(done, isCurrent)}>
                {stageLabel(stage)}
              </span>
              {event && (done || isCurrent) ? (
                <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {caption(event)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
