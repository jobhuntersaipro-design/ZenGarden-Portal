import { describe, expect, it } from "vitest";
import {
  MAX_VARIANT_ROWS,
  productVariantsSchema,
  type ProductVariantsInput,
} from "@/lib/validation/product-variants";

/** The shared half of a submit. Variants are added per test. */
const shared: Omit<ProductVariantsInput, "variants"> = {
  name: "Zen Garden Shower Cream 2.1L",
  category: "Shower cream & gel",
  unit: "carton",
  brand: "ZEN GARDEN",
  packSize: 6,
  cartonsPerPallet: 60,
  market: "Vietnam",
  description: null,
  active: true,
  familyId: null,
  newFamily: null,
};

const row = (variant: string, sku: string, listPrice = "189.00") => ({
  variant,
  sku,
  listPrice,
  stockPieces: null,
});

/** The first issue's message, which is what the action reports. */
const failure = (input: ProductVariantsInput) => {
  const result = productVariantsSchema.safeParse(input);
  if (result.success) throw new Error("expected the parse to fail");
  return result.error.issues[0]?.message;
};

describe("productVariantsSchema", () => {
  it("accepts one variant with no family, like the form does today", () => {
    const result = productVariantsSchema.safeParse({
      ...shared,
      variants: [row("Goat's Milk", "ZEN-SC-2100-GM-VN")],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.variants).toHaveLength(1);
    expect(result.data.variants[0]?.variant).toBe("Goat's Milk");
  });

  it("carries the shared fields through untouched", () => {
    const result = productVariantsSchema.safeParse({
      ...shared,
      variants: [row("Papaya", "ZEN-SC-2100-PP-VN")],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe("Zen Garden Shower Cream 2.1L");
    expect(result.data.packSize).toBe(6);
    expect(result.data.cartonsPerPallet).toBe(60);
    expect(result.data.market).toBe("Vietnam");
  });

  it("refuses a second variant with no family", () => {
    expect(
      failure({
        ...shared,
        variants: [
          row("Papaya", "ZEN-SC-2100-PP-VN"),
          row("Lavender", "ZEN-SC-2100-LV-VN"),
        ],
      }),
    ).toBe(
      "Two or more variants need a family, so the shop shows them as one product.",
    );
  });

  it("accepts a second variant against an existing family", () => {
    const result = productVariantsSchema.safeParse({
      ...shared,
      familyId: "fam-1",
      variants: [
        row("Papaya", "ZEN-SC-2100-PP-VN"),
        row("Lavender", "ZEN-SC-2100-LV-VN"),
      ],
    });
    expect(result.success).toBe(true);
  });

  it("names the SKU two rows share", () => {
    expect(
      failure({
        ...shared,
        familyId: "fam-1",
        variants: [
          row("Papaya", "ZEN-SC-2100-PP"),
          row("Lavender", "ZEN-SC-2100-PP"),
        ],
      }),
    ).toBe("Two variants carry the SKU ZEN-SC-2100-PP. Every variant needs its own.");
  });

  it("catches a duplicate that only normalisation reveals", () => {
    // skuSchema upper-cases and collapses whitespace, so these are one code.
    expect(
      failure({
        ...shared,
        familyId: "fam-1",
        variants: [
          row("Papaya", "zen-sc-2100-pp"),
          row("Lavender", "ZEN-SC-2100-PP"),
        ],
      }),
    ).toBe("Two variants carry the SKU ZEN-SC-2100-PP. Every variant needs its own.");
  });

  it("validates each variant's own price", () => {
    expect(
      failure({
        ...shared,
        variants: [row("Papaya", "ZEN-SC-2100-PP-VN", "0")],
      }),
    ).toBe("The list price must be a number above zero");
  });

  it("refuses an empty variants array", () => {
    expect(failure({ ...shared, variants: [] })).toBe("Add at least one variant");
  });

  it(`refuses more than ${MAX_VARIANT_ROWS} variants`, () => {
    const variants = Array.from({ length: MAX_VARIANT_ROWS + 1 }, (_, index) =>
      row(`Flavour ${index}`, `ZEN-SC-2100-F${index}`),
    );
    expect(failure({ ...shared, familyId: "fam-1", variants })).toBe(
      `Use at most ${MAX_VARIANT_ROWS} variants at a time`,
    );
  });

  it("still refuses a family picked and described at once", () => {
    expect(
      failure({
        ...shared,
        familyId: "fam-1",
        newFamily: {
          code: "ZEN-SC-2100",
          name: "Zen Garden Shower Cream 2.1L",
          brand: "ZEN GARDEN",
          category: "Shower cream & gel",
          size: "2.1L",
        },
        variants: [row("Papaya", "ZEN-SC-2100-PP-VN")],
      }),
    ).toBe("Choose an existing family or describe a new one, not both");
  });
});
