import { describe, expect, it } from "vitest";
import { catalogueHeading, isNarrowed, resultLabel } from "@/lib/shop-catalogue-labels";

const none = { q: undefined, brands: [], packSizes: [], markets: [] };

describe("catalogueHeading", () => {
  it("names a search", () => {
    expect(catalogueHeading({ q: "zzzz", category: undefined })).toBe('Results for "zzzz"');
  });

  it("reads as before without one", () => {
    expect(catalogueHeading({ q: undefined, category: undefined })).toBe("All products");
    expect(catalogueHeading({ q: undefined, category: "Hair care" })).toBe("Hair care");
  });
});

describe("resultLabel", () => {
  it("says a search matched nothing, not that the shop is empty", () => {
    expect(resultLabel(0, 0, 0, isNarrowed({ ...none, q: "zzzz" }))).toBe("No products match");
    expect(resultLabel(0, 0, 0, isNarrowed({ ...none, brands: ["Aara"] }))).toBe(
      "No products match",
    );
  });

  it("keeps the empty-shop wording when nothing narrows the grid", () => {
    expect(resultLabel(0, 0, 0, isNarrowed(none))).toBe("Nothing yet");
  });

  it("counts as before", () => {
    expect(resultLabel(1, 1, 1, false)).toBe("1 product");
    expect(resultLabel(48, 1, 24, true)).toBe("48 products · showing 1–24");
  });
});
