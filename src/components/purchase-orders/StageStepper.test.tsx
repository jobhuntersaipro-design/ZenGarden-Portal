import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StageStepper, type StageEvent } from "@/components/purchase-orders/StageStepper";

// The buyer's query nulls every actor so no staff name reaches the shop; the
// portal keeps the name, and a null there really was the system.
const events: StageEvent[] = [
  { toStage: "ORDER_PLACED", changedAt: "2026-09-21T02:00:00.000Z", changedByName: null },
  { toStage: "IN_PRODUCTION", changedAt: "2026-09-24T02:00:00.000Z", changedByName: "Chris Lam" },
];

describe("StageStepper's captions", () => {
  it("names nobody on the buyer's page — not even System (2026-09-24)", () => {
    const html = renderToStaticMarkup(
      <StageStepper current="IN_PRODUCTION" events={events.map((e) => ({ ...e, changedByName: null }))} showActor={false} />,
    );
    expect(html).toContain("21 Sep 2026");
    expect(html).not.toContain("System");
  });

  it("keeps the actor, and System for a null one, in the portal", () => {
    const html = renderToStaticMarkup(<StageStepper current="IN_PRODUCTION" events={events} showActor />);
    expect(html).toContain("21 Sep 2026 · System");
    expect(html).toContain("24 Sep 2026 · Chris Lam");
  });
});
