import { describe, expect, it } from "vitest";
import { productSchema, skuSchema } from "@/lib/validation/products";

const valid = {
  name: "Granite stepping stone 40cm",
  sku: "STN-GRA-040",
  category: "Shower cream & gel" as const,
  unit: "carton",
  listPrice: "42.50",
  brand: "ZEN GARDEN",
  variant: "Goat's Milk",
  packSize: 6,
  market: "Malaysia",
  description: "Flamed finish.",
  active: true,
};

describe("skuSchema", () => {
  it("accepts capitals, digits and dashes", () => {
    expect(skuSchema.safeParse("STN-GRA-040").success).toBe(true);
    expect(skuSchema.safeParse("ABC123").success).toBe(true);
  });

  it("accepts the codes real purchase orders actually print", () => {
    // All three exist in production, created from customer documents. Before
    // 2026-09-09 the schema refused them, so those products could not be saved
    // from the edit drawer at all.
    for (const real of ["ZEN/SC/2100/CARROT", "ZENSC-R.JELLY2LT", "KE218441 68216"]) {
      expect(skuSchema.safeParse(real).success, real).toBe(true);
    }
  });

  it("normalises case and whitespace, so one code cannot enter twice", () => {
    expect(skuSchema.parse("  stn-gra-040 ")).toBe("STN-GRA-040");
    expect(skuSchema.parse("KE218441   68216")).toBe("KE218441 68216");
  });

  it("still refuses an empty code, or one that is only separators", () => {
    for (const bad of ["", "   ", "-", "/", "-ABC", "ABC-", " . "]) {
      expect(skuSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
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
    // "Stone" was a category until 2026-09-08; the list is personal care now.
    for (const bad of ["Gadgets", "Stone"]) {
      expect(productSchema.safeParse({ ...valid, category: bad }).success).toBe(
        false,
      );
    }
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

  it("accepts a product with no market", () => {
    // Nullable, never optional: the key is always sent, so a call site that
    // forgets the field fails to typecheck instead of silently clearing it.
    const parsed = productSchema.parse({ ...valid, market: null });
    expect(parsed.market).toBeNull();
  });

  it("turns a blank market into null rather than an empty string", () => {
    // Otherwise listMarkets() offers "" as a market anyone can pick.
    expect(productSchema.parse({ ...valid, market: "   " }).market).toBeNull();
  });

  it("trims a market, so the same market cannot enter the list twice", () => {
    expect(productSchema.parse({ ...valid, market: " Malaysia " }).market).toBe(
      "Malaysia",
    );
  });

  it("trims brand and variant to null the way market is, so no picker offers a blank", () => {
    const parsed = productSchema.parse({ ...valid, brand: "  ", variant: " Lavender " });
    expect(parsed.brand).toBeNull();
    expect(parsed.variant).toBe("Lavender");
  });

  it("accepts a product with no brand, variant or pack size", () => {
    const parsed = productSchema.parse({
      ...valid,
      brand: null,
      variant: null,
      packSize: null,
    });
    expect(parsed.packSize).toBeNull();
  });

  it("takes the pack size as typed, so a form field can feed it", () => {
    expect(productSchema.parse({ ...valid, packSize: "12" }).packSize).toBe(12);
    expect(productSchema.parse({ ...valid, packSize: "" }).packSize).toBeNull();
  });

  it("refuses a pack size that is not a whole number above zero", () => {
    for (const bad of ["0", "-6", "1.5", "six"]) {
      expect(productSchema.safeParse({ ...valid, packSize: bad }).success, bad).toBe(
        false,
      );
    }
  });

  it("refuses a market longer than any real country name", () => {
    expect(
      productSchema.safeParse({ ...valid, market: "x".repeat(57) }).success,
    ).toBe(false);
  });
});
