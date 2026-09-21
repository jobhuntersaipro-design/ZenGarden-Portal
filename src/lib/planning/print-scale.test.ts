import { describe, expect, it } from "vitest";
import { PRINT_PAGE_WIDTH_PX, printScale } from "@/lib/planning/print-scale";

describe("fitting the board to a printed page", () => {
  it("shrinks a board wider than the page, to exactly the page", () => {
    // Thirty day columns are around this wide.
    const scale = printScale(1800)!;
    expect(1800 * scale).toBeCloseTo(PRINT_PAGE_WIDTH_PX, 6);
  });

  it("leaves a board that already fits at its own size", () => {
    // Blowing a four-column board up to fill the sheet would make it look
    // like a different document from a twelve-column one.
    expect(printScale(600)).toBeNull();
    expect(printScale(PRINT_PAGE_WIDTH_PX)).toBeNull();
  });

  it("refuses a width nothing measured, rather than dividing by it", () => {
    // An element not laid out yet, or one that is `display: none`.
    for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(printScale(width), String(width)).toBeNull();
    }
  });

  it("is always a shrink, never a stretch", () => {
    for (const width of [1033, 1500, 3000, 12_000]) {
      const scale = printScale(width)!;
      expect(scale, String(width)).toBeGreaterThan(0);
      expect(scale, String(width)).toBeLessThan(1);
    }
  });
});
