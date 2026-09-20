"use client";

import { useState } from "react";
import type { Role } from "@/generated/prisma/enums";
import { StageBadge } from "@/components/portal/StatusBadge";
import { PersonAvatar } from "@/components/ui/person";
import { formatDateTime } from "@/lib/dates";
import { roleLabel } from "@/lib/permissions/roles";
import {
  buildLifecycleFeed,
  type ActivitySegment,
  type PoActivityEvent,
} from "@/lib/po-activity";
import { pageRange } from "@/lib/queries/pagination";

export type { PoActivityEvent };

/** A purchase order accumulates one row a move; ten is a screenful. */
const PAGE_SIZE = 10;

/**
 * Notes and activity for one purchase order, under the stepper (2026-09-18).
 *
 * It used to sit at the foot of the page as "Activity", and a note only
 * reached the reader through the one-line caption above the stepper, which
 * showed the *latest* note and nothing else. Every note now has a row here,
 * whichever stage it was left on, and the whole feed is the default view —
 * there is no per-node filter, so nothing is hidden behind a selected stage.
 *
 * One row per action: a stage move and the note left with it are a single
 * thing that happened, so the sentence is the row's title and the note sits
 * under it — one avatar, one actor, one timestamp. A Note pill is for a note
 * that arrives on its own, with no activity to ride on.
 *
 * The stage a row belongs to is named inside its own sentence, as the status
 * pill, rather than tagged beside the row's kind: "from [In production] to
 * [QC passed]" says both ends, where the tag could only repeat one of them.
 *
 * Newest first, the order this list and its query have always used.
 */
export function LifecycleFeed({
  events,
  confirmedAt,
  confirmedByName,
  confirmedByImage,
  confirmedByRole,
}: {
  events: PoActivityEvent[];
  confirmedAt: string;
  confirmedByName: string | null;
  confirmedByImage: string | null;
  confirmedByRole: Role | null;
}) {
  const items = buildLifecycleFeed({
    events,
    confirmedAt,
    confirmedByName,
    confirmedByImage,
    confirmedByRole,
  });

  /**
   * Paged in the browser, not through the URL. The feed is one card on a page
   * that also holds a document and a summary, and a `?page=` round trip would
   * re-render all of it — and scroll the reader back to the top of the order
   * to read the next ten rows of its history.
   */
  const [page, setPage] = useState(1);
  const { from, to, pages } = pageRange(page, PAGE_SIZE, items.length);
  // A feed that shortens under a reader — a row removed elsewhere — must not
  // strand them on a page that no longer exists.
  const current = Math.min(page, pages);
  const shown = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const step =
    "inline-flex min-h-control-md items-center gap-xxs rounded-sm px-sm py-xxs text-[length:var(--text-body-sm)] text-ink transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus disabled:pointer-events-none disabled:text-ink-disabled sm:min-h-0";

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
        <>
          <ol className="flex flex-col gap-sm">
            {shown.map((item) => (
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
                  {/* Which kind of row this is, said rather than implied by
                      the quotation marks around a note. */}
                  <span
                    className={`self-start rounded-pill px-xs py-xxs font-mono text-[length:var(--text-caption)] ${
                      item.type === "note"
                        ? "bg-ink text-canvas"
                        : "bg-surface-soft text-ink-secondary"
                    }`}
                  >
                    {item.type === "note" ? "Note" : "Activity"}
                  </span>
                  {item.title ? (
                    <span className="text-[length:var(--text-body-sm)] leading-loose text-ink">
                      {item.title.map((part, index) => (
                        <Segment key={index} part={part} />
                      ))}
                    </span>
                  ) : null}
                  {/* What was left with this action, under its own sentence
                      rather than in a row of its own: the system's record of
                      what moved, then the person's own words. */}
                  {item.detail ? (
                    <span className="text-[length:var(--text-body-sm)] text-ink-secondary">
                      {item.detail}
                    </span>
                  ) : null}
                  {item.note ? (
                    <span className="whitespace-pre-wrap text-[length:var(--text-body-sm)] text-ink-secondary">
                      “{item.note}”
                    </span>
                  ) : null}
                  {/* Who, in what job, and when. The role sits between the
                      two because it belongs to the name, not to the clock:
                      four ops roles own different stage moves, so "who
                      advanced this" is only half an answer without it. System
                      has no role and prints none. */}
                  <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                    {item.actor}
                    {item.actorRole ? ` · ${roleLabel(item.actorRole)}` : ""} ·{" "}
                    {formatDateTime(item.at)}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {items.length > PAGE_SIZE ? (
            <div className="mt-md flex flex-wrap items-center justify-between gap-md">
              <span className="tabular-nums text-[length:var(--text-body-sm)] text-ink-secondary">
                {from}–{to} of {items.length}
              </span>
              <div className="flex items-center gap-sm">
                <button
                  type="button"
                  className={step}
                  disabled={current <= 1}
                  onClick={() => setPage(current - 1)}
                >
                  Previous
                </button>
                <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">
                  Page {current} of {pages}
                </span>
                <button
                  type="button"
                  className={step}
                  disabled={current >= pages}
                  onClick={() => setPage(current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * A stage name inside a sentence is the same pill the header, the heading and
 * the stepper draw; everything around it is words.
 */
function Segment({ part }: { part: ActivitySegment }) {
  if (part.kind === "stage") return <StageBadge stage={part.stage} />;
  return <>{part.text}</>;
}
