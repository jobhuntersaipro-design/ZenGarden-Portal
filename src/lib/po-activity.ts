import type { PoEventKind, PoStage } from "@/generated/prisma/enums";
import { SYSTEM_ACTOR } from "@/lib/system-actor";
import { stageIndex, stageLabel } from "@/lib/po-stages";

/**
 * The lifecycle feed on a purchase order's page: its stage moves, its edits
 * and the notes people left with them, as one list (2026-09-18).
 *
 * Pure — no Prisma, no React — so the sentences can be tested on their own.
 *
 * **Every stage sentence names both ends.** "Moved to In production" left the
 * reader to work out where it came from, and on a page where someone may have
 * moved an order *back*, that is the part worth knowing. `PoStageEvent` has
 * stored `fromStage` since Phase 05, so it is read rather than guessed from
 * the stepper's order: a real history row is the only thing that can say what
 * the previous stage actually was.
 */

/** Written by `writePurchaseOrder` when a reviewer accepts a totals mismatch. */
const MISMATCH_PREFIX = "Confirmed with a totals mismatch";

export type PoActivityEvent = {
  id: string;
  kind: PoEventKind;
  fromStage: PoStage | null;
  toStage: PoStage;
  note: string | null;
  /** ISO. Formatted by the component, so this module stays free of time zones. */
  changedAt: string;
  changedByName: string | null;
  changedByImage: string | null;
};

/**
 * A sentence in pieces, so the component can draw a stage name as the status
 * pill the rest of the page uses and leave the words around it as words
 * (2026-09-18). The wording is unchanged — both ends of a move are still
 * named, in the same order.
 */
export type ActivitySegment =
  | { kind: "text"; text: string }
  | { kind: "stage"; stage: PoStage };

const text = (value: string): ActivitySegment => ({ kind: "text", text: value });
const stageIn = (stage: PoStage): ActivitySegment => ({ kind: "stage", stage });

/** The same sentence as one string — for a test, a title or a screen reader. */
export const activityText = (segments: ActivitySegment[]): string =>
  segments
    .map((part) => (part.kind === "text" ? part.text : stageLabel(part.stage)))
    .join("");

/**
 * One row per action (2026-09-18). A stage move and the note left with it are
 * one thing that happened, so they are one record: the sentence is the row's
 * title and the note sits under it, with the actor and the time said once.
 * Splitting them gave the reader two rows carrying the same avatar, the same
 * name and the same timestamp for a single click.
 */
export type LifecycleItem = {
  id: string;
  /**
   * An activity is something the system recorded; a note is something a
   * person wrote on its own. Today every stored record is an action with a
   * sentence, so `note` is reserved for a note that arrives with no activity
   * to ride on — it is rendered rather than dropped.
   */
  type: "activity" | "note";
  actor: string;
  actorImage: string | null;
  at: string;
  /** The activity sentence. Null on a standalone note, which has none. */
  title: ActivitySegment[] | null;
  /**
   * What was written with this action. A person's note is quoted; one the
   * system wrote — the fields an edit changed, a totals mismatch's figures —
   * is not, because quotation marks would put words in somebody's mouth.
   */
  note: { text: string; quoted: boolean } | null;
};

/**
 * One sentence for one recorded event: actor, verb, and both stages where the
 * event moved the order.
 */
export function describeActivity(
  event: PoActivityEvent,
  actor: string,
): ActivitySegment[] {
  if (event.kind === "EDIT") {
    const note = event.note ?? "";
    if (note.startsWith(MISMATCH_PREFIX)) {
      return [text(`${actor} confirmed this order with a totals mismatch`)];
    }
    /**
     * One row, one sentence: an edit says it was an edit, and the fields it
     * moved ride under it as the note (2026-09-18). They used to be spliced
     * into the sentence, which made an edit of four fields the longest line
     * in the feed.
     */
    return [text(`${actor} edited this order`)];
  }

  // No previous stage: the confirm-time row that opens every lifecycle.
  if (!event.fromStage) return [text(`${actor} placed the order`)];

  const from = stageIn(event.fromStage);
  const to = stageIn(event.toStage);
  if (stageIndex(event.toStage) > stageIndex(event.fromStage)) {
    return [text(`${actor} advanced this order from `), from, text(" to "), to];
  }
  if (stageIndex(event.toStage) < stageIndex(event.fromStage)) {
    return [
      text(`${actor} moved this order back from `),
      from,
      text(" to "),
      to,
    ];
  }
  // Same stage on a STAGE row: nothing writes one today, and inventing a
  // direction for it would be a guess.
  return [text(`${actor} recorded this order at `), to];
}

/**
 * The feed, newest first — the order the page's activity list has always used,
 * and the order the query returns.
 *
 * One record per stored event: the note it carried belongs to that same row,
 * under the sentence, rather than to a second row repeating its avatar, actor
 * and timestamp. An edit's note — the fields it moved, a totals mismatch's
 * figures — is the system's own record and reads plainly; a person's note is
 * quoted.
 */
export function buildLifecycleFeed(input: {
  events: PoActivityEvent[];
  confirmedAt: string;
  confirmedByName: string | null;
  confirmedByImage: string | null;
}): LifecycleItem[] {
  const items: LifecycleItem[] = [];

  for (const event of input.events) {
    const actor = event.changedByName ?? SYSTEM_ACTOR;
    const note = event.note?.trim();
    const title = describeActivity(event, actor);
    items.push({
      id: event.id,
      type: title.length > 0 ? "activity" : "note",
      actor,
      actorImage: event.changedByImage,
      at: event.changedAt,
      title: title.length > 0 ? title : null,
      // An EDIT's note is the system's own record of what moved, not
      // somebody's words, so it is shown plainly rather than in quotes.
      note: note ? { text: note, quoted: event.kind !== "EDIT" } : null,
    });
  }

  // Confirming is not a stage event, so it has no row of its own to read; it
  // is always the oldest thing that happened to a purchase order.
  items.push({
    id: "confirmed",
    type: "activity",
    actor: input.confirmedByName ?? SYSTEM_ACTOR,
    actorImage: input.confirmedByImage,
    at: input.confirmedAt,
    title: [
      { kind: "text", text: `${input.confirmedByName ?? SYSTEM_ACTOR} confirmed the order` },
    ],
    note: null,
  });

  return items;
}
