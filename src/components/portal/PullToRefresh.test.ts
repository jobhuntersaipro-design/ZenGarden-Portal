import { describe, expect, it } from "vitest";
import { PULL_THRESHOLD, pullDistance } from "./PullToRefresh";

describe("pullDistance", () => {
  it("ignores an upward or zero drag", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-40)).toBe(0);
  });

  // Resistance: a finger has to travel twice the threshold, so a scroll
  // flick that starts at the top does not refresh by accident.
  it("needs twice the threshold of finger travel to arm", () => {
    expect(pullDistance(PULL_THRESHOLD * 2 - 2)).toBeLessThan(PULL_THRESHOLD);
    expect(pullDistance(PULL_THRESHOLD * 2)).toBe(PULL_THRESHOLD);
  });

  it("stops the indicator past the cap however far the finger goes", () => {
    expect(pullDistance(1000)).toBe(pullDistance(5000));
    expect(pullDistance(1000)).toBeGreaterThan(PULL_THRESHOLD);
  });
});
