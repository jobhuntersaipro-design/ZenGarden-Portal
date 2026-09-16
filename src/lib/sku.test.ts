import { describe, expect, it } from "vitest";
import {
  generateFamilyCode,
  generateSku,
  generateVariantSku,
  isGeneratedSku,
  sizeInName,
  skuCode,
} from "@/lib/sku";
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

  it("falls back to initials for a category the table has never heard of", () => {
    // Categories grow by typing since Phase 27, so the table is a starting
    // vocabulary like the brand and market ones — not a closed list whose
    // absence would leave the type segment `undefined`.
    expect(generateSku({ ...product, category: "Pet care" })).toBe(
      "ZEN-PC-2100-GM-VN",
    );
    expect(generateSku({ ...product, category: "Bleach" })).toBe(
      "ZEN-BLEACH-2100-GM-VN",
    );
  });

  it("still abbreviates every seeded category", () => {
    expect(generateSku({ ...product, category: "Hand wash & soap" })).toBe(
      "ZEN-HW-2100-GM-VN",
    );
    expect(generateSku({ ...product, category: "Uncategorised" })).toBe(
      "ZEN-XX-2100-GM-VN",
    );
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

describe("generateFamilyCode", () => {
  const family = {
    brand: "Zen Garden",
    category: "Shower cream & gel",
    size: "2.1L",
  } as const;

  it("builds BRAND-TYPE-SIZE — the product, across every market", () => {
    expect(generateFamilyCode(family)).toBe("ZEN-SC-2100");
  });

  it("appends a qualifier as typed, because SCRUB reads and SS does not", () => {
    expect(generateFamilyCode({ ...family, size: "1L", qualifier: "Scrub" })).toBe(
      "ZEN-SC-1000-SCRUB",
    );
    expect(generateFamilyCode({ ...family, qualifier: "big ctn" })).toBe(
      "ZEN-SC-2100-BIGCTN",
    );
  });

  it("drops the size for a line the sheet gives none", () => {
    expect(generateFamilyCode({ ...family, size: null })).toBe("ZEN-SC");
  });

  it("is the first three segments of the one-shot code", () => {
    const code = generateFamilyCode(family);
    expect(
      generateSku({ ...family, variant: "Goat's Milk", market: "Vietnam" }),
    ).toBe(`${code}-GM-VN`);
  });

  it("always satisfies the SKU schema, so a family code can be a SKU prefix", () => {
    for (const code of [
      generateFamilyCode(family),
      generateFamilyCode({ ...family, brand: "L.Hands", qualifier: "Pump (Cap)" }),
      generateFamilyCode({ ...family, brand: null, size: null }),
    ]) {
      expect(skuSchema.safeParse(code).success, code).toBe(true);
    }
  });
});

describe("generateVariantSku", () => {
  it("extends the family code with the variant and the market", () => {
    expect(
      generateVariantSku("ZEN-SC-2100", { variant: "Goat's Milk", market: "Vietnam" }),
    ).toBe("ZEN-SC-2100-GM-VN");
  });

  it("leaves out what the variant does not have", () => {
    expect(generateVariantSku("ZEN-SC-2100", { variant: "Goat's Milk", market: null })).toBe(
      "ZEN-SC-2100-GM",
    );
    expect(generateVariantSku("ZEN-SC-2100", { variant: null, market: null })).toBe(
      "ZEN-SC-2100",
    );
  });

  it("takes a pack suffix only when asked for one", () => {
    expect(
      generateVariantSku("ZEN-SC-2100", { variant: "Goat's Milk", market: null, packSize: 12 }),
    ).toBe("ZEN-SC-2100-GM-X12");
  });

  it("keeps a hand-typed family code as it is", () => {
    // A family code is stored, never re-derived, so whatever a person chose
    // is what a variant extends.
    expect(generateVariantSku("ZEN-SC-1000-SCRUB", { variant: "Papaya", market: null })).toBe(
      "ZEN-SC-1000-SCRUB-PP",
    );
  });
});

describe("isGeneratedSku", () => {
  const product = {
    brand: "Zen Garden",
    category: "Shower cream & gel",
    name: "Zen Garden Shower Cream 2.1L",
    variant: "Goat's Milk",
    market: "Indonesia",
    familyCode: "ZS-SC-2100",
  };

  it("recognises a code the family generator made", () => {
    const sku = generateVariantSku("ZS-SC-2100", { variant: "Goat's Milk", market: "Indonesia" });
    expect(isGeneratedSku({ ...product, sku })).toBe(true);
  });

  it("recognises a code the family-less generator made", () => {
    const sku = generateSku({
      brand: "Zen Garden",
      category: "Shower cream & gel",
      size: "2.1L",
      variant: "Goat's Milk",
      market: "Indonesia",
    });
    expect(isGeneratedSku({ ...product, familyCode: null, sku })).toBe(true);
  });

  it("refuses a customer's own printed code", () => {
    // The eight production rows carrying these are what this rule protects:
    // the purchase-order extraction matches lines to products by exact code.
    expect(isGeneratedSku({ ...product, sku: "ZEN/SC/2100/CARROT" })).toBe(false);
    expect(isGeneratedSku({ ...product, sku: "KE218441 68216" })).toBe(false);
  });

  it("refuses a hand-typed code that merely looks generated", () => {
    expect(isGeneratedSku({ ...product, sku: "ZS-SC-2100-GM" })).toBe(false);
  });

  it("compares through normaliseSku, so case and spacing do not decide it", () => {
    const sku = generateVariantSku("ZS-SC-2100", { variant: "Goat's Milk", market: "Indonesia" });
    expect(isGeneratedSku({ ...product, sku: sku.toLowerCase() })).toBe(true);
  });

  it("is false once the product's family is recoded", () => {
    // The safe side of the rule, recorded in the spec: the test recomputes
    // from the family's *current* code, so a rename turns an automatic
    // rewrite into an offered one.
    const sku = generateVariantSku("ZS-SC-2100", { variant: "Goat's Milk", market: "Indonesia" });
    expect(isGeneratedSku({ ...product, familyCode: "ZS-SC-2100-SCRUB", sku })).toBe(false);
  });
});

describe("sizeInName", () => {
  it("reads the size a name prints, in the form sizeCode wants", () => {
    expect(sizeInName("ZEN Shower Cream 2.1L — Goat's Milk")).toBe("2.1L");
    expect(sizeInName("H/WASH 500ML (7/LAYER X 8)")).toBe("500ML");
    expect(sizeInName("ZEN D'LUX 2.9 kg LIQUID DETERGENT")).toBe("2.9KG");
  });

  it("does not mistake a variant's initials for grams", () => {
    expect(sizeInName("ZEN GM")).toBeNull();
    expect(sizeInName("HAIR GEL")).toBeNull();
  });
});
