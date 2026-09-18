import { describe, expect, it } from "vitest";
import { buildLifecycleFeed, describeActivity, type PoActivityEvent } from "@/lib/po-activity";

const event = (over: Partial<PoActivityEvent> = {}): PoActivityEvent => ({
  id: "e1",
  kind: "STAGE",
  fromStage: "ORDER_PLACED",
  toStage: "IN_PRODUCTION",
  note: null,
  changedAt: "2026-09-18T02:00:00.000Z",
  changedByName: "Chris Lam",
  changedByImage: null,
  ...over,
});

/**
 * Both stages, always. "Moved to In production" cannot tell a reader whether
 * the order went forwards or backwards, which on a page with a Move back
 * button is the thing they are looking for.
 */
describe("describeActivity", () => {
  it("names who moved it, from where, to where", () => {
    expect(describeActivity(event(), "Chris Lam")).toBe(
      "Chris Lam advanced this order from Order placed to In production",
    );
  });

  it("says a move back is a move back", () => {
    expect(
      describeActivity(
        event({ fromStage: "QC_PASSED", toStage: "IN_PRODUCTION" }),
        "Chris Lam",
      ),
    ).toBe("Chris Lam moved this order back from QC passed to In production");
  });

  it("reads the stored previous stage, not the stepper's order", () => {
    // Two stages back at once: derived from the stepper this would read
    // "from In warehouse", which is not where the order was.
    expect(
      describeActivity(
        event({ fromStage: "DELIVERING", toStage: "QC_PASSED" }),
        "Aisha Rahman",
      ),
    ).toContain("from Delivering to QC passed");
  });

  it("opens the lifecycle with the order being placed", () => {
    expect(
      describeActivity(
        event({ fromStage: null, toStage: "ORDER_PLACED", changedByName: null }),
        "System",
      ),
    ).toBe("System placed the order");
  });

  it("names the fields an edit changed", () => {
    expect(
      describeActivity(
        event({ kind: "EDIT", note: "Edited: PO date, Payment terms" }),
        "Chris Lam",
      ),
    ).toBe("Chris Lam edited PO date, Payment terms on this order");
  });

  it("names a totals mismatch for what it is", () => {
    expect(
      describeActivity(
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
      title:
        "Chris Lam advanced this order from Order placed to In production",
      note: "Line 3 was short-shipped.",
      stage: "IN_PRODUCTION",
      actor: "Chris Lam",
      at: "2026-09-18T02:00:00.000Z",
    });
  });

  it("leaves note null on an action nobody wrote on", () => {
    expect(feed([event()])[0].note).toBeNull();
  });

  it("keeps notes from earlier stages, not only the latest", () => {
    const items = feed([
      event({ id: "e2", fromStage: "IN_PRODUCTION", toStage: "QC_PASSED", note: "Second" }),
      event({ id: "e1", note: "First" }),
    ]);
    expect(items.map((item) => item.note)).toEqual(["Second", "First", null]);
  });

  it("does not repeat an edit's fields as a note", () => {
    const items = feed([event({ kind: "EDIT", note: "Edited: PO date" })]);
    expect(items[0]).toMatchObject({
      title: "Chris Lam edited PO date on this order",
      note: null,
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
    expect(items[0]).toMatchObject({
      title: "Chris Lam confirmed this order with a totals mismatch",
      note,
    });
  });

  it("ends with the confirmation, the oldest thing on the order", () => {
    const items = feed([event()]);
    expect(items.at(-1)).toMatchObject({
      title: "Aisha Rahman confirmed the order",
      at: "2026-09-01T02:00:00.000Z",
      stage: null,
    });
  });
});
