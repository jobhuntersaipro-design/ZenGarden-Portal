import { describe, expect, it } from "vitest";
import { generateSku, skuCode } from "@/lib/sku";
import { skuSchema } from "@/lib/validation/products";

describe("skuCode", () => {
  it("abbreviates a known brand, type, variant or market", () => {
    expect(skuCode("brand", "ZEN GARDEN")).toBe("ZEN");
    expect(skuCode("brand", "MR. KING")).toBe("MRK");
    expect(skuCode("variant", "Goat's Milk")).toBe("GM");
    expect(skuCode("variant", "Royal Jelly")).toBe("RJ");
    expect(skuCode("market", "Vietnam")).toBe("VN");
    expect(skuCode("market", "Malaysia")).toBe("MY");
  });

  it("is case- and punctuation-insensitive, so the sheet's spellings all resolve", () => {
    expect(skuCode("brand", "Zen Garden")).toBe("ZEN");
    expect(skuCode("variant", "GOAT'S MILK")).toBe("GM");
    expect(skuCode("variant", "goats milk")).toBe("GM");
  });

  it("falls back to the first letters of each word for an unknown value", () => {
    // A customer name like "Hero Market" has no table entry and must still
    // produce something a person can read back.
    expect(skuCode("market", "Hero Market")).toBe("HM");
    expect(skuCode("variant", "Blue Cypress")).toBe("BC");
  });

  it("uses the whole word when there is only one", () => {
    expect(skuCode("market", "Mydin")).toBe("MYDIN");
    expect(skuCode("variant", "Lavender")).toBe("LV");
  });
});

describe("generateSku", () => {
  const product = {
    brand: "ZEN GARDEN",
    category: "Shower cream & gel",
    size: "2.1L",
    variant: "Goat's Milk",
    market: "Vietnam",
  } as const;

  it("builds BRAND-TYPE-SIZE-VARIANT-MARKET", () => {
    expect(generateSku(product)).toBe("ZEN-SC-2100-GM-VN");
  });

  it("expresses litres and kilograms in millilitres and grams, so sizes sort", () => {
    expect(generateSku({ ...product, size: "500ML" })).toBe("ZEN-SC-0500-GM-VN");
    expect(generateSku({ ...product, size: "2.9KG" })).toBe("ZEN-SC-2900-GM-VN");
    expect(generateSku({ ...product, size: "1L" })).toBe("ZEN-SC-1000-GM-VN");
  });

  it("drops a segment that has no value rather than leaving a double dash", () => {
    expect(generateSku({ ...product, variant: null })).toBe("ZEN-SC-2100-VN");
    expect(generateSku({ ...product, market: null, variant: null })).toBe(
      "ZEN-SC-2100",
    );
  });

  it("always satisfies the SKU schema the form enforces", () => {
    for (const sku of [
      generateSku(product),
      generateSku({ ...product, brand: "L.Hands", market: "AA Pharmacy" }),
      generateSku({ ...product, size: null, variant: "Anti-Dandruff (Green)" }),
    ]) {
      expect(skuSchema.safeParse(sku).success, sku).toBe(true);
    }
  });
});
