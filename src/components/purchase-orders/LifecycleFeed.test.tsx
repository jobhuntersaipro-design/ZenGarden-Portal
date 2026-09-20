import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LifecycleFeed } from "@/components/purchase-orders/LifecycleFeed";
import type { PoActivityEvent } from "@/lib/po-activity";

const event = (over: Partial<PoActivityEvent> = {}): PoActivityEvent => ({
  id: "e1",
  kind: "STAGE",
  fromStage: "IN_PRODUCTION",
  toStage: "QC_PASSED",
  note: null,
  changedAt: "2026-09-18T01:37:00.000Z",
  changedByName: "Chris Lam",
  changedByImage: null,
  changedByRole: "QC",
  ...over,
});

const feed = (events: PoActivityEvent[], over: Partial<Parameters<typeof LifecycleFeed>[0]> = {}) =>
  renderToStaticMarkup(
    <LifecycleFeed
      events={events}
      confirmedAt="2026-09-01T02:00:00.000Z"
      confirmedByName="Aisha Rahman"
      confirmedByImage={null}
      confirmedByRole="SUPER_ADMIN"
      {...over}
    />,
  );

/**
 * A row records what somebody did, and since Phase 48 four ops roles own
 * different stage moves — so the job the mover holds is part of reading the
 * history, not decoration. `roleLabel`'s spelling, the same one the roster
 * and the permission grid print.
 */
describe("LifecycleFeed names each actor's role", () => {
  it("prints the role between the name and the time", () => {
    const markup = feed([event()]);
    expect(markup).toContain("Chris Lam · QC · 18 Sep 2026");
    expect(markup).toContain("Aisha Rahman · Super admin · 1 Sep 2026");
  });

  it("prints no role for System, which holds no job", () => {
    const markup = feed(
      [
        event({
          fromStage: null,
          toStage: "ORDER_PLACED",
          changedByName: null,
          changedByImage: null,
          changedByRole: null,
        }),
      ],
      { confirmedByName: null, confirmedByRole: null },
    );
    // No stray separator and no "undefined" where a role would have gone.
    expect(markup).toContain("System · 18 Sep 2026");
    expect(markup).not.toContain("undefined");
  });

  /**
   * The role is read off the actor's own row, never inferred from the stage
   * they moved: a super admin may make any move, so the stage's usual owner
   * is no evidence of who made it.
   */
  it("prints the actor's own role, not the role that owns the stage", () => {
    expect(feed([event({ changedByRole: "SUPER_ADMIN" })])).toContain(
      "Chris Lam · Super admin ·",
    );
  });
});
