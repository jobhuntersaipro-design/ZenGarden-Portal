import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, stepZoom } from "@/components/review/ZoomControls";

describe("stepZoom", () => {
  it("steps up and down through the scale", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
  });

  it("clamps at both ends rather than running off the scale", () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });

  it("snaps to the next step from a value between two of them", () => {
    // "fit" resolves to whatever the container gives, which is rarely a step.
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(1.1, -1)).toBe(1);
  });

  it("does not stall on a value sitting exactly on a step", () => {
    expect(stepZoom(1.5, 1)).toBe(2);
    expect(stepZoom(1.5, -1)).toBe(1.25);
  });
});
