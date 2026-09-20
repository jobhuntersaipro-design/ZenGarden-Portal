import { describe, expect, it } from "vitest";
import {
  activityText,
  buildLifecycleFeed,
  describeActivity,
  type PoActivityEvent,
} from "@/lib/po-activity";

/** The sentence as a reader sees it, whatever pieces it is drawn from. */
const say = (...args: Parameters<typeof describeActivity>) =>
  activityText(describeActivity(...args));

const event = (over: Partial<PoActivityEvent> = {}): PoActivityEvent => ({
  id: "e1",
  kind: "STAGE",
  fromStage: "ORDER_PLACED",
  toStage: "IN_PRODUCTION",
  note: null,
  changedAt: "2026-09-18T02:00:00.000Z",
  changedByName: "Chris Lam",
  changedByImage: null,
  changedByRole: "WAREHOUSE",
  ...over,
});

/**
 * Both stages, always. "Moved to In production" cannot tell a reader whether
 * the order went forwards or backwards, which on a page with a Move back
 * button is the thing they are looking for.
 */
describe("describeActivity", () => {
  it("names who moved it, from where, to where", () => {
    expect(say(event(), "Chris Lam")).toBe(
      "Chris Lam advanced this order from Order placed to In production",
    );

    // The two stage names are their own pieces, so the component can draw
    // them as the status pill rather than as words.
    expect(describeActivity(event(), "Chris Lam")).toEqual([
      { kind: "text", text: "Chris Lam advanced this order from " },
      { kind: "stage", stage: "ORDER_PLACED" },
      { kind: "text", text: " to " },
      { kind: "stage", stage: "IN_PRODUCTION" },
    ]);
  });

  it("says a move back is a move back", () => {
    expect(
      say(event({ fromStage: "QC_PASSED", toStage: "IN_PRODUCTION" }), "Chris Lam"),
    ).toBe("Chris Lam moved this order back from QC passed to In production");
  });

  it("reads the stored previous stage, not the stepper's order", () => {
    // Two stages back at once: derived from the stepper this would read
    // "from In warehouse", which is not where the order was.
    expect(
      say(event({ fromStage: "DELIVERING", toStage: "QC_PASSED" }), "Aisha Rahman"),
    ).toContain("from Delivering to QC passed");
  });

  it("opens the lifecycle with the order being placed", () => {
    expect(
      say(
        event({ fromStage: null, toStage: "ORDER_PLACED", changedByName: null }),
        "System",
      ),
    ).toBe("System placed the order");
  });

  /**
   * The fields ride under the sentence as the row's note (2026-09-18), so an
   * edit of four of them is no longer the longest line in the feed.
   */
  it("says an edit was an edit, without listing the fields", () => {
    expect(
      say(
        event({ kind: "EDIT", note: "Edited: PO date, Payment terms" }),
        "Chris Lam",
      ),
    ).toBe("Chris Lam edited this order");
  });

  it("names a totals mismatch for what it is", () => {
    expect(
      say(
        event({
          kind: "EDIT",
          note: "Confirmed with a totals mismatch: computed RM 1.00, document RM 2.00, difference RM 1.00",
        }),
        "Aisha Rahman",
      ),
    ).toBe("Aisha Rahman confirmed this order with a totals mismatch");
  });
});

describe("buildLifecycleFeed", () => {
  const feed = (events: PoActivityEvent[]) =>
    buildLifecycleFeed({
      events,
      confirmedAt: "2026-09-01T02:00:00.000Z",
      confirmedByName: "Aisha Rahman",
      confirmedByImage: null,
      confirmedByRole: "SUPER_ADMIN",
    });

  /**
   * The point of the 2026-09-18 change: an advance and the note left with it
   * are one action, so they are one row. Two rows meant the same avatar, the
   * same name and the same timestamp printed twice for a single click.
   */
  it("keeps an action and its note in one row", () => {
    const items = feed([event({ note: "Line 3 was short-shipped." })]);
    expect(items).toHaveLength(2); // the move, then the confirmation
    expect(items[0]).toMatchObject({
      type: "activity",
      detail: null,
      note: "Line 3 was short-shipped.",
      actor: "Chris Lam",
      at: "2026-09-18T02:00:00.000Z",
    });
    expect(activityText(items[0].title!)).toBe(
      "Chris Lam advanced this order from Order placed to In production",
    );
  });

  it("leaves note null on an action nobody wrote on", () => {
    expect(feed([event()])[0].note).toBeNull();
  });

  it("keeps notes from earlier stages, not only the latest", () => {
    const items = feed([
      event({ id: "e2", fromStage: "IN_PRODUCTION", toStage: "QC_PASSED", note: "Second" }),
      event({ id: "e1", note: "First" }),
    ]);
    expect(items.map((item) => item.note)).toEqual([
      "Second",
      "First",
      null,
    ]);
  });

  /**
   * The system wrote it, so it is not put in quotation marks as if somebody
   * had said it.
   */
  it("carries an edit's fields as the system's own plain record", () => {
    const items = feed([event({ kind: "EDIT", note: "Edited: PO date" })]);
    expect(activityText(items[0].title!)).toBe("Chris Lam edited this order");
    expect(items[0]).toMatchObject({ detail: "Edited: PO date", note: null });
  });

  /**
   * A moved delivery date is recorded with both dates and the reason its
   * editor was asked for — the record plainly, their words quoted.
   */
  it("splits a moved delivery date from the reason given for it", () => {
    const items = feed([
      event({
        kind: "EDIT",
        note: "Expected delivery 2 Oct 2026 → 9 Oct 2026\nBuyer asked for another week.",
      }),
    ]);
    expect(items[0]).toMatchObject({
      detail: "Expected delivery 2 Oct 2026 → 9 Oct 2026",
      note: "Buyer asked for another week.",
    });
  });

  /**
   * The mismatch note is kept, because it carries the figures the sentence
   * does not — but on the same row as the sentence, not under a second pill.
   */
  it("carries a totals mismatch's figures under its own sentence", () => {
    const note =
      "Confirmed with a totals mismatch: computed RM 1.00, document RM 2.00, difference RM 1.00";
    const items = feed([event({ kind: "EDIT", note })]);
    expect(items).toHaveLength(2);
    expect(activityText(items[0].title!)).toBe(
      "Chris Lam confirmed this order with a totals mismatch",
    );
    expect(items[0]).toMatchObject({ detail: note, note: null });
  });

  /**
   * Shown beside the name on every row (2026-09-20). The role is read off the
   * actor's own row rather than inferred from the move, because the grid lets
   * a super admin make any move and a stage's usual owner is not proof of who
   * made it.
   */
  it("carries each actor's role, and none for System", () => {
    const items = feed([
      event(),
      event({ id: "e0", fromStage: null, toStage: "ORDER_PLACED", changedByName: null, changedByRole: null }),
    ]);
    expect(items.map((item) => [item.actor, item.actorRole])).toEqual([
      ["Chris Lam", "WAREHOUSE"],
      ["System", null],
      ["Aisha Rahman", "SUPER_ADMIN"],
    ]);
  });

  it("ends with the confirmation, the oldest thing on the order", () => {
    const items = feed([event()]);
    expect(activityText(items.at(-1)!.title!)).toBe(
      "Aisha Rahman confirmed the order",
    );
    expect(items.at(-1)).toMatchObject({ at: "2026-09-01T02:00:00.000Z" });
  });
});
