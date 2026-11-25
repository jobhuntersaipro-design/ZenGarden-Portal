import { describe, expect, it } from "vitest";
import { palletSplit, palletsOf } from "./pallets";

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
  it("counts the truck as on the way until delivered, then as delivered", () => {
    expect(palletSplit(10, 4, "DELIVERING")).toEqual({ delivered: 0, onTruck: 4, remaining: 6 });
    expect(palletSplit(10, 4, "PENDING")).toEqual({ delivered: 0, onTruck: 0, remaining: 10 });
    expect(palletSplit(10, 4, "DELIVERED")).toEqual({ delivered: 4, onTruck: 0, remaining: 6 });
  });
  it("leaves everything to deliver when nobody typed a count, and caps an overcount", () => {
    expect(palletSplit(10, null, "DELIVERING")).toEqual({ delivered: 0, onTruck: 0, remaining: 10 });
    expect(palletSplit(10, 14, "DELIVERING")).toEqual({ delivered: 0, onTruck: 10, remaining: 0 });
  });
});
