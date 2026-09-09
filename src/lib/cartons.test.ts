import { describe, expect, it } from "vitest";
import { lineTotal, piecesFor, quantityCaption, unitLabel } from "@/lib/cartons";

describe("piecesFor", () => {
  it("multiplies cartons by the pack size", () => {
    expect(piecesFor(12, 6)).toBe(72);
  });

  it("has no piece count when the product carries no pack size", () => {
    expect(piecesFor(12, null)).toBeNull();
  });
});

describe("unitLabel", () => {
  it("says how many pieces are in a carton when the catalogue knows", () => {
    expect(unitLabel(6, "carton")).toBe("6 per carton");
  });

  it("falls back to the product's own unit when it does not", () => {
    expect(unitLabel(null, "carton")).toBe("per carton");
    expect(unitLabel(null, "drum")).toBe("per drum");
  });
});

describe("quantityCaption", () => {
  it("reads as the client entered it, with the pieces derived", () => {
    expect(quantityCaption(12, 6, "carton")).toBe("12 cartons · 72 pieces");
  });

  it("is singular for one", () => {
    expect(quantityCaption(1, 6, "carton")).toBe("1 carton · 6 pieces");
  });

  it("drops the piece half when there is no pack size", () => {
    expect(quantityCaption(3, null, "carton")).toBe("3 cartons");
    expect(quantityCaption(1, null, "drum")).toBe("1 drum");
  });
});

describe("lineTotal", () => {
  it("is Decimal arithmetic, not float", () => {
    // 0.1 * 3 is 0.30000000000000004 in binary floating point. Money that is
    // one cent out is exactly what the totals gate exists to catch.
    expect(lineTotal(3, "0.10")).toBe("0.30");
  });

  it("multiplies cartons by the price per carton", () => {
    expect(lineTotal(12, "189.00")).toBe("2268.00");
  });

  it("is zero for nothing ordered", () => {
    expect(lineTotal(0, "189.00")).toBe("0.00");
  });
});
