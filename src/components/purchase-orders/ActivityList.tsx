import type { PoEventKind, PoStage } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
import { stageLabel } from "@/lib/po-stages";

export type ActivityEvent = {
  id: string;
  kind: PoEventKind;
  fromStage: PoStage | null;
  toStage: PoStage;
  note: string | null;
  changedAt: string;
  changedByName: string | null;
};

/**
 * Newest first. EDIT entries — a field change, or a totals mismatch someone
 * accepted at confirm time — read as "Edited …" and are ignored by every
 * analytics function; only STAGE events describe the lifecycle.
 */
export function ActivityList({
  events,
  confirmedAt,
  confirmedByName,
}: {
  events: ActivityEvent[];
  confirmedAt: string;
  confirmedByName: string | null;
}) {
  return (
    <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Activity
      </h2>
      <ol className="flex flex-col gap-sm">
        {events.map((event) => {
          const isEdit = event.kind === "EDIT";
          // The confirm-time event has no actor: nobody moved it there.
          const actor = event.changedByName ?? "System";
          const headline = isEdit
            ? (event.note ?? "Edited")
            : event.fromStage
              ? `Moved to ${stageLabel(event.toStage)}`
              : `${stageLabel(event.toStage)} — lifecycle started`;

          return (
            <li key={event.id} className="flex flex-col gap-xxs border-b border-hairline pb-sm last:border-0 last:pb-0">
              <p className="text-[length:var(--text-body-sm)] text-ink">
                {headline}
                {!isEdit && event.note ? (
                  <span className="text-ink-secondary"> — “{event.note}”</span>
                ) : null}
              </p>
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                {actor} · {formatDateTime(event.changedAt)}
              </p>
            </li>
          );
        })}
        <li className="flex flex-col gap-xxs">
          <p className="text-[length:var(--text-body-sm)] text-ink">Confirmed</p>
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            {confirmedByName ?? "System"} · {formatDateTime(confirmedAt)}
          </p>
        </li>
      </ol>
    </section>
  );
}
