import { StageBadge } from "@/components/portal/StatusBadge";
import { PersonAvatar } from "@/components/ui/person";
import { formatDateTime } from "@/lib/dates";
import { buildLifecycleFeed, type PoActivityEvent } from "@/lib/po-activity";

export type { PoActivityEvent };

/**
 * Notes and activity for one purchase order, under the stepper (2026-09-18).
 *
 * It used to sit at the foot of the page as "Activity", and a note only
 * reached the reader through the one-line caption above the stepper, which
 * showed the *latest* note and nothing else. Every note now has a row here,
 * whichever stage it was left on, and the whole feed is the default view —
 * there is no per-node filter, so nothing is hidden behind a selected stage.
 *
 * One row per action (2026-09-18): a stage move and the note left with it are
 * a single thing that happened, so the sentence is the row's title and the
 * note sits under it — one avatar, one actor, one timestamp. A Note pill is
 * for a note that arrives on its own, with no activity to ride on.
 *
 * Newest first, the order this list and its query have always used.
 */
export function LifecycleFeed({
  events,
  confirmedAt,
  confirmedByName,
  confirmedByImage,
}: {
  events: PoActivityEvent[];
  confirmedAt: string;
  confirmedByName: string | null;
  confirmedByImage: string | null;
}) {
  const items = buildLifecycleFeed({
    events,
    confirmedAt,
    confirmedByName,
    confirmedByImage,
  });

  return (
    <section className="mt-lg border-t border-hairline pt-md">
      <h3 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Notes and activity
      </h3>

      {items.length === 0 ? (
        <p className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          No notes or activity yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-sm">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-sm border-b border-hairline pb-sm last:border-0 last:pb-0"
            >
              <PersonAvatar
                name={item.actor}
                image={item.actorImage}
                className="mt-xxs"
              />
              {/* spans, not <p>: a block-level p inside this row would fight
                  the flex gap with its own default margins. */}
              <span className="flex min-w-0 flex-col gap-xxs">
                <span className="flex flex-wrap items-center gap-xs">
                  {/* Which kind of row this is, said rather than implied by
                      the quotation marks around a note. */}
                  <span
                    className={`rounded-pill px-xs py-xxs font-mono text-[length:var(--text-caption)] ${
                      item.type === "note"
                        ? "bg-ink text-canvas"
                        : "bg-surface-soft text-ink-secondary"
                    }`}
                  >
                    {item.type === "note" ? "Note" : "Activity"}
                  </span>
                  {/* The stage this belongs to, as the same pill the header
                      and the stepper use — not raw grey text (2026-09-18). */}
                  {item.stage ? <StageBadge stage={item.stage} /> : null}
                </span>
                {item.title ? (
                  <span className="text-[length:var(--text-body-sm)] text-ink">
                    {item.title}
                  </span>
                ) : null}
                {/* The note the actor left with this action, under its own
                    sentence rather than in a row of its own. */}
                {item.note ? (
                  <span className="whitespace-pre-wrap text-[length:var(--text-body-sm)] text-ink-secondary">
                    “{item.note}”
                  </span>
                ) : null}
                <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {item.actor} · {formatDateTime(item.at)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
