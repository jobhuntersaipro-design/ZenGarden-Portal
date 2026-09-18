import { PersonAvatar } from "@/components/ui/person";
import { formatDateTime } from "@/lib/dates";
import { buildLifecycleFeed, type PoActivityEvent } from "@/lib/po-activity";
import { stageLabel } from "@/lib/po-stages";

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
                  {item.stage ? (
                    <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                      {stageLabel(item.stage)}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`text-[length:var(--text-body-sm)] ${
                    item.type === "note"
                      ? "whitespace-pre-wrap text-ink-secondary"
                      : "text-ink"
                  }`}
                >
                  {item.type === "note" ? `“${item.body}”` : item.body}
                </span>
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
