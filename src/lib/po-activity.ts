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

/** Written by `updatePurchaseOrder` as "Edited: PO date, Payment terms". */
const EDIT_PREFIX = "Edited: ";
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

export type LifecycleItem = {
  id: string;
  /** A note is what a person wrote; an activity is what the system recorded. */
  type: "activity" | "note";
  actor: string;
  actorImage: string | null;
  at: string;
  /** The stage the item belongs to, where it belongs to one. */
  stage: PoStage | null;
  body: string;
};

/**
 * One sentence for one recorded event: actor, verb, and both stages where the
 * event moved the order.
 */
export function describeActivity(event: PoActivityEvent, actor: string): string {
  if (event.kind === "EDIT") {
    const note = event.note ?? "";
    if (note.startsWith(EDIT_PREFIX)) {
      return `${actor} edited ${note.slice(EDIT_PREFIX.length)} on this order`;
    }
    if (note.startsWith(MISMATCH_PREFIX)) {
      return `${actor} confirmed this order with a totals mismatch`;
    }
    return `${actor} edited this order`;
  }

  // No previous stage: the confirm-time row that opens every lifecycle.
  if (!event.fromStage) return `${actor} placed the order`;

  const from = stageLabel(event.fromStage);
  const to = stageLabel(event.toStage);
  if (stageIndex(event.toStage) > stageIndex(event.fromStage)) {
    return `${actor} advanced this order from ${from} to ${to}`;
  }
  if (stageIndex(event.toStage) < stageIndex(event.fromStage)) {
    return `${actor} moved this order back from ${from} to ${to}`;
  }
  // Same stage on a STAGE row: nothing writes one today, and inventing a
  // direction for it would be a guess.
  return `${actor} recorded this order at ${to}`;
}

/**
 * The feed, newest first — the order the page's activity list has always used,
 * and the order the query returns.
 *
 * A note rides on the event that carried it, so it is listed as its own row
 * directly under that activity: same actor, same moment, same stage, and the
 * reader can tell at a glance what a person wrote from what the system did.
 * An "Edited: …" note is not repeated, because its sentence already names the
 * fields.
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
    items.push({
      id: event.id,
      type: "activity",
      actor,
      actorImage: event.changedByImage,
      at: event.changedAt,
      stage: event.toStage,
      body: describeActivity(event, actor),
    });

    const note = event.note?.trim();
    if (note && !note.startsWith(EDIT_PREFIX)) {
      items.push({
        id: `${event.id}-note`,
        type: "note",
        actor,
        actorImage: event.changedByImage,
        at: event.changedAt,
        stage: event.toStage,
        body: note,
      });
    }
  }

  // Confirming is not a stage event, so it has no row of its own to read; it
  // is always the oldest thing that happened to a purchase order.
  items.push({
    id: "confirmed",
    type: "activity",
    actor: input.confirmedByName ?? SYSTEM_ACTOR,
    actorImage: input.confirmedByImage,
    at: input.confirmedAt,
    stage: null,
    body: `${input.confirmedByName ?? SYSTEM_ACTOR} confirmed the order`,
  });

  return items;
}
