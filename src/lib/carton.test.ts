import { describe, expect, it } from "vitest";
import { cartonCbm, cartonLines } from "@/lib/carton";

const empty = { cartonLengthCm: null, cartonWidthCm: null, cartonHeightCm: null, grossWeightKg: null };

describe("carton", () => {
  it("derives CBM to four decimals", () => {
    expect(cartonCbm({ cartonLengthCm: 23.5, cartonWidthCm: 20, cartonHeightCm: 25.4 })).toBe(0.0119);
  });

  it("prints the ticket's three lines", () => {
    expect(
      cartonLines({ cartonLengthCm: 23.5, cartonWidthCm: 20, cartonHeightCm: 25.4, grossWeightKg: 14.16 }),
    ).toEqual([
      "Carton measurements: 23.5cm x 20cm x 25.4cm",
      "Gross weight: 14.16kg",
      "Cbm: 0.0119m³",
    ]);
  });

  it("prints nothing for a product with no carton values", () => {
    expect(cartonLines(empty)).toEqual([]);
    expect(cartonCbm(empty)).toBeNull();
  });

  it("hides the size and CBM until all three sides are set", () => {
    expect(cartonLines({ ...empty, cartonLengthCm: 10, cartonWidthCm: 10, grossWeightKg: 2 })).toEqual([
      "Gross weight: 2kg",
    ]);
  });
});
