import { describe, expect, it } from "vitest";
import { buyerOrderStatus } from "@/lib/buyer-order-status";

describe("buyerOrderStatus", () => {
  it("names what the buyer is waiting for, not where the order sits", () => {
    // Phase 38: there is now a concrete event behind the wait — the team
    // confirming a delivery date, which arrives by email.
    expect(buyerOrderStatus({ kind: "submitted", stage: null })).toBe(
      "Awaiting confirmation",
    );
  });

  it("reads the fulfilment stage once the order is confirmed", () => {
    expect(buyerOrderStatus({ kind: "confirmed", stage: "IN_PRODUCTION" })).toBe(
      "In production",
    );
  });

  it("says plainly when an order was not accepted", () => {
    expect(buyerOrderStatus({ kind: "declined", stage: null })).toBe(
      "Not accepted",
    );
  });

  it("falls back to the waiting wording for a confirmed order with no stage", () => {
    expect(buyerOrderStatus({ kind: "confirmed", stage: null })).toBe(
      "Awaiting confirmation",
    );
  });

  // Phase 41: the team can now mark an order received before confirming it.
  it("says the team has it once received", () => {
    expect(buyerOrderStatus({ kind: "received", stage: null })).toBe(
      "Received by the team",
    );
  });
});
