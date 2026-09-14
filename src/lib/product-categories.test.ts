import { describe, expect, it } from "vitest";
import { PRODUCT_CATEGORIES, isProductCategory } from "@/lib/product-categories";

describe("PRODUCT_CATEGORIES", () => {
  it("carries Uncategorised, which the purchase-order intake writes", () => {
    // `resolveProducts` writes this string verbatim for a line whose document
    // gives no category, and `CatalogLabel` is seeded from this array — so a
    // database born from it can always store what the intake produces.
    expect(PRODUCT_CATEGORIES).toContain("Uncategorised");
  });

  it("holds no duplicates, in any casing", () => {
    const seen = PRODUCT_CATEGORIES.map((value) => value.toLowerCase());
    expect(new Set(seen).size).toBe(PRODUCT_CATEGORIES.length);
  });

  it("recognises its own members and nothing else", () => {
    expect(isProductCategory("Hair care")).toBe(true);
    expect(isProductCategory("Pet care")).toBe(false);
  });
});
