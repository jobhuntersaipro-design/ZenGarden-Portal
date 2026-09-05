import { describe, expect, it } from "vitest";
import { productSchema, skuSchema } from "@/lib/validation/products";

const valid = {
  name: "Granite stepping stone 40cm",
  sku: "STN-GRA-040",
  category: "Stone" as const,
  unit: "piece",
  listPrice: "42.50",
  description: "Flamed finish.",
  active: true,
};

describe("skuSchema", () => {
  it("accepts capitals, digits and dashes", () => {
    expect(skuSchema.safeParse("STN-GRA-040").success).toBe(true);
    expect(skuSchema.safeParse("ABC123").success).toBe(true);
  });

  it("refuses lower case, spaces and punctuation", () => {
    // Two people entering the "same" SKU two ways is the failure this stops.
    for (const bad of ["stn-gra-040", "STN GRA 040", "STN_GRA_040", "STN/040"]) {
      expect(skuSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("refuses an empty SKU", () => {
    expect(skuSchema.safeParse("").success).toBe(false);
  });
});

describe("productSchema", () => {
  it("accepts a complete product", () => {
    expect(productSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a category outside the catalogue", () => {
    expect(productSchema.safeParse({ ...valid, category: "Gadgets" }).success).toBe(
      false,
    );
  });

  it("refuses a list price of zero or below", () => {
    expect(productSchema.safeParse({ ...valid, listPrice: "0" }).success).toBe(false);
    expect(productSchema.safeParse({ ...valid, listPrice: "-5" }).success).toBe(false);
  });

  it("refuses a list price that is not a number", () => {
    expect(productSchema.safeParse({ ...valid, listPrice: "RM 42.50" }).success).toBe(
      false,
    );
  });

  it("accepts a fractional price", () => {
    expect(productSchema.safeParse({ ...valid, listPrice: "0.05" }).success).toBe(true);
  });

  it("turns a blank description into null rather than an empty string", () => {
    const parsed = productSchema.parse({ ...valid, description: "   " });
    expect(parsed.description).toBeNull();
  });

  it("requires a unit", () => {
    expect(productSchema.safeParse({ ...valid, unit: "" }).success).toBe(false);
  });
});
