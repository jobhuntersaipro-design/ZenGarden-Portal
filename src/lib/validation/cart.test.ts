import { describe, expect, it } from "vitest";
import { MAX_CARTONS_PER_LINE, cartonsProblem } from "@/lib/validation/cart";

describe("cartonsProblem (S-01)", () => {
  it("lets a whole count between 1 and the ceiling through", () => {
    expect(cartonsProblem(1)).toBeNull();
    expect(cartonsProblem(MAX_CARTONS_PER_LINE)).toBeNull();
  });

  it("refuses an empty box, which the stepper hands over as 0", () => {
    expect(cartonsProblem(0)).toBe("Enter at least 1 carton.");
    expect(cartonsProblem(Number.NaN)).toBe("Enter at least 1 carton.");
  });

  it("refuses a count past the ceiling the server would refuse", () => {
    expect(cartonsProblem(MAX_CARTONS_PER_LINE + 1)).toBe("Up to 9,999 cartons at a time.");
  });
});
