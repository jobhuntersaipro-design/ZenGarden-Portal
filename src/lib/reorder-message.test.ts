import { describe, expect, it } from "vitest";
import { reorderMessage } from "@/lib/reorder-message";

describe("reorderMessage", () => {
  it("counts what was added", () => {
    expect(reorderMessage(3, [])).toBe("3 lines added to your cart");
    expect(reorderMessage(1, [])).toBe("1 line added to your cart");
  });

  it("names what was skipped", () => {
    expect(reorderMessage(2, ["ZEN 1L — Goat's Milk"])).toBe(
      "2 lines added to your cart — 1 no longer available: ZEN 1L — Goat's Milk",
    );
  });
});
