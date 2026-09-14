import { describe, expect, it } from "vitest";
import { PRODUCT_CATEGORIES, categoryOptions } from "@/lib/product-categories";

describe("categoryOptions", () => {
  it("offers the seeded list when nothing else is in use", () => {
    expect(categoryOptions([])).toEqual([...PRODUCT_CATEGORIES]);
  });

  it("keeps the seeded list first and appends the rest alphabetically", () => {
    const options = categoryOptions(["Pet care", "Bleach", "Hair care"]);

    expect(options.slice(0, PRODUCT_CATEGORIES.length)).toEqual([
      ...PRODUCT_CATEGORIES,
    ]);
    expect(options.slice(PRODUCT_CATEGORIES.length)).toEqual([
      "Bleach",
      "Pet care",
    ]);
  });

  it("does not offer a seeded category twice because a product stores it in another case", () => {
    // `Combobox` matches case-insensitively, so "hair care" cannot be added
    // beside "Hair care" from the UI — but a row imported or written by a
    // script can carry it, and the picker must not then show both.
    expect(categoryOptions(["hair care", "HAND CARE"])).toEqual([
      ...PRODUCT_CATEGORIES,
      "HAND CARE",
    ]);
  });
});
