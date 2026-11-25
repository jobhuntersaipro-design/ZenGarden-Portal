import { describe, expect, it } from "vitest";
import { landStatusOf, palletSplit, palletsOf } from "./pallets";

describe("palletsOf", () => {
  it("rounds each line up and counts lines with no pallet size apart", () => {
    expect(
      palletsOf([
        { quantity: 130, product: { cartonsPerPallet: 60 } },
        { quantity: 60, product: { cartonsPerPallet: 60 } },
        { quantity: 10, product: { cartonsPerPallet: null } },
        { quantity: 5, product: null },
      ]),
    ).toEqual({ pallets: 4, unpalletedLines: 2 });
  });
});

describe("palletSplit", () => {
  const t = (pallets: number | null, status: "PENDING" | "DELIVERING" | "DELIVERED") => ({ pallets, status });
  it("adds up every truck by its status", () => {
    expect(palletSplit(10, [t(4, "DELIVERING"), t(3, "DELIVERED"), t(2, "PENDING")])).toEqual({ delivered: 3, onTruck: 4, remaining: 3, over: 0 });
    expect(palletSplit(10, [])).toEqual({ delivered: 0, onTruck: 0, remaining: 10, over: 0 });
    expect(palletSplit(10, [t(null, "DELIVERING")])).toEqual({ delivered: 0, onTruck: 0, remaining: 10, over: 0 });
  });
  it("caps delivered, then on the way, at the total and flags the overcount", () => {
    expect(palletSplit(10, [t(8, "DELIVERED"), t(6, "DELIVERING")])).toEqual({ delivered: 8, onTruck: 2, remaining: 0, over: 4 });
  });
});

describe("landStatusOf", () => {
  it("is delivered only when every truck is, and on the way once any has left", () => {
    expect(landStatusOf([])).toBe("PENDING");
    expect(landStatusOf([{ status: "PENDING" }, { status: "PENDING" }])).toBe("PENDING");
    expect(landStatusOf([{ status: "DELIVERED" }, { status: "PENDING" }])).toBe("DELIVERING");
    expect(landStatusOf([{ status: "DELIVERED" }, { status: "DELIVERED" }])).toBe("DELIVERED");
  });
});
