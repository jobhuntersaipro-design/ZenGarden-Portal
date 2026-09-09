import { describe, expect, it } from "vitest";
import { utils } from "xlsx";
import {
  categorise,
  parseBlock,
  readLabelColumns,
  toProducts,
} from "@/lib/catalog-import";

/**
 * The block from the screenshot the user shared on 2026-09-08: ZEN GARDEN
 * merged down five rows in A, "VIETNAM ZEN 2.1L (6)" merged down the same five
 * in B, one variant per row in C, and stock figures to the right that the
 * import must ignore. Then a second block whose brand cell is merged across
 * *both* blocks, the way the real sheet merges a brand over several lines.
 */
function screenshotSheet() {
  const ws = utils.aoa_to_sheet([
    ["", "", "", "STOCK"],
    ["ZEN GARDEN", "VIETNAM ZEN 2.1L (6)", "GOAT'S MILK", 115],
    ["", "", "LAVENDER", 152],
    ["", "", "PAPAYA", 0],
    ["", "", "ROYAL JELLY [19]", 27],
    ["", "", "GREEN TEA [20]", 43],
    ["", "ZEN 1L (12) 52CTNS/PALLET", "GOAT'S MILK", 8],
    ["", "", "LAVENDER", 0],
    ["MR. KING", "MR.KING 1.5L (12)", "LEMON", 3],
    ["", "", "LIME", 4],
    ["", "HAND SANITIZER 60ML (48PCS/CTN)", "", 1],
  ]);
  ws["!merges"] = [
    { s: { r: 1, c: 0 }, e: { r: 7, c: 0 } }, // ZEN GARDEN over both lines
    { s: { r: 1, c: 1 }, e: { r: 5, c: 1 } }, // VIETNAM ZEN 2.1L (6)
    { s: { r: 6, c: 1 }, e: { r: 7, c: 1 } }, // ZEN 1L (12)
    { s: { r: 8, c: 0 }, e: { r: 10, c: 0 } }, // MR. KING
    { s: { r: 8, c: 1 }, e: { r: 9, c: 1 } }, // MR.KING 1.5L (12)
  ];
  return ws;
}

const columns = { brand: 0, block: 1, variant: 2 };

describe("readLabelColumns", () => {
  it("fills merged brand and block cells down to every row they cover", () => {
    const rows = readLabelColumns(screenshotSheet(), columns);
    expect(rows[3]).toEqual({
      brand: "ZEN GARDEN",
      block: "VIETNAM ZEN 2.1L (6)",
      variant: "PAPAYA",
    });
    // Row 6 is a new block under the same merged brand.
    expect(rows[7]).toEqual({
      brand: "ZEN GARDEN",
      block: "ZEN 1L (12) 52CTNS/PALLET",
      variant: "LAVENDER",
    });
  });

  it("reads a header row as blanks rather than throwing", () => {
    expect(readLabelColumns(screenshotSheet(), columns)[0]).toEqual({
      brand: "",
      block: "",
      variant: "",
    });
  });
});

describe("parseBlock", () => {
  it("splits a market prefix, the line, its size and its pack count", () => {
    expect(parseBlock("VIETNAM ZEN 2.1L (6)")).toEqual({
      market: "Vietnam",
      line: "ZEN 2.1L",
      size: "2.1L",
      packSize: 6,
    });
  });

  it("treats a customer name in the market position as the market", () => {
    expect(parseBlock("MYDIN ZEN 1L (12)").market).toBe("Mydin");
    expect(parseBlock("HERO MARKET H/WASH 500ML (24)").market).toBe("Hero Market");
  });

  it("normalises the sheet's spellings, so the picker holds one market", () => {
    // The sheet writes both; two entries would fragment the market list.
    expect(parseBlock("PHILLIPPINES ZEN 1L (12)").market).toBe("Philippines");
    expect(parseBlock("PHILLIPINES H/WASH 500ML (24)").market).toBe("Philippines");
  });

  it("leaves the market null for the home market", () => {
    expect(parseBlock("ZEN 1L (12) 52CTNS/PALLET")).toEqual({
      market: null,
      line: "ZEN 1L",
      size: "1L",
      packSize: 12,
    });
  });

  it("drops the pallet note from the line, bare or parenthesised", () => {
    expect(parseBlock("H/WASH 500ML (24) - 54 ctns/pallet").line).toBe("H/WASH 500ML");
    expect(parseBlock("ZEN 1L (12) 52CTNS/PALLET").line).toBe("ZEN 1L");
    expect(parseBlock("MYDIN ZEN 1L (12)(52CTNS/P)").line).toBe("ZEN 1L");
    expect(parseBlock("ZEN 800ML BABY WASH (12) (55 CTN/PLT)").line).toBe(
      "ZEN 800ML BABY WASH",
    );
  });

  it("drops the possessive the sheet writes after a customer name", () => {
    // "LOTUS 'S 2.1L (6)" is Lotus's, not a line called "'S".
    expect(parseBlock("LOTUS 'S 2.1L (6) 60CTNS/PALLET")).toEqual({
      market: "Lotus",
      line: "2.1L",
      size: "2.1L",
      packSize: 6,
    });
  });
});

describe("titleCase, via toProducts", () => {
  it("keeps two-letter initialisms and capitalises after an apostrophe", () => {
    const { products } = toProducts([
      { brand: "AA PHARMACY", block: "H/WASH 500ML (24)", variant: "GOAT'S MILK" },
      { brand: "L'EVINIA", block: "400ML", variant: "STYLE" },
    ]);
    expect(products.map((p) => p.brand)).toEqual(["AA Pharmacy", "L'Evinia"]);
    expect(products[0].variant).toBe("Goat's Milk");
  });
});

describe("categorise", () => {
  it("maps the sheet's line names onto the nine categories", () => {
    expect(categorise("ZEN 2.1L")).toBe("Shower cream & gel");
    expect(categorise("H/WASH 500ML")).toBe("Hand wash & soap");
    expect(categorise("ZEN HAIR SHAMPOO 1L")).toBe("Hair care");
    expect(categorise("MR.KING 1.5L")).toBe("Dishwash & cleanser");
    expect(categorise("ZEN D'LUX 2.9KG LIQUID DETERGENT")).toBe("Laundry detergent");
    expect(categorise("HAND SANITIZER 60ML")).toBe("Hand sanitizer");
    expect(categorise("ZEN ROLL ON")).toBe("Fragrance");
    expect(categorise("ZEN 410ML MASSAGE & BODY OIL")).toBe("Body care");
    expect(categorise("SOMETHING ELSE")).toBe("Uncategorised");
  });
});

describe("toProducts", () => {
  const { products, duplicates, skipped } = toProducts(
    readLabelColumns(screenshotSheet(), columns),
  );

  it("makes one product per variant, and one for a line with no variants", () => {
    // The line keeps the sheet's capitals; the variant is title-cased and
    // loses its footnote marker.
    expect(products.map((p) => p.name)).toEqual([
      "ZEN 2.1L — Goat's Milk",
      "ZEN 2.1L — Lavender",
      "ZEN 2.1L — Papaya",
      "ZEN 2.1L — Royal Jelly",
      "ZEN 2.1L — Green Tea",
      "ZEN 1L — Goat's Milk",
      "ZEN 1L — Lavender",
      "MR.KING 1.5L — Lemon",
      "MR.KING 1.5L — Lime",
      "HAND SANITIZER 60ML",
    ]);
  });

  it("carries brand, market, pack size and a generated SKU", () => {
    expect(products[0]).toMatchObject({
      brand: "Zen Garden",
      market: "Vietnam",
      packSize: 6,
      category: "Shower cream & gel",
      sku: "ZEN-SC-2100-GM-VN",
      unit: "carton",
    });
    expect(products[7].sku).toBe("MRK-DW-1500-LE");
  });

  it("skips the header row and sets nothing aside", () => {
    expect(products).toHaveLength(10);
    expect(duplicates).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("keeps a line sold in two carton sizes, disambiguated by pack", () => {
    // MR.KING 1.5L by 12 and by 6 are different things to order; before the
    // pack segment the second silently vanished.
    const { products, duplicates } = toProducts([
      { brand: "MR. KING", block: "MR.KING 1.5L (12)", variant: "LEMON" },
      { brand: "MR. KING", block: "MR.KING 1.5L (6)", variant: "LEMON" },
    ]);
    expect(products.map((p) => p.sku)).toEqual([
      "MRK-DW-1500-LE",
      "MRK-DW-1500-LE-X6",
    ]);
    expect(duplicates).toEqual([]);
  });

  it("falls back to a counter when size and pack both match", () => {
    // 1L DWASH PUMP and 1L DWASH CAP are both twelves.
    const { products } = toProducts([
      { brand: "L.HANDS", block: "1L DWASH PUMP (12)", variant: "LEMON" },
      { brand: "L.HANDS", block: "1L DWASH CAP (12)", variant: "LEMON" },
    ]);
    expect(products.map((p) => p.sku)).toEqual([
      "LHANDS-DW-1000-LE",
      "LHANDS-DW-1000-LE-2",
    ]);
  });

  it("sets aside a block whose variant column nests a sub-table", () => {
    const { products, skipped } = toProducts([
      { brand: "ZEN GARDEN", block: "ZEN 1L (12)", variant: "LAVENDER" },
      { brand: "ZEN GARDEN", block: "HAIR GEL", variant: "150ML (48) ANTI-DANDRUFF" },
      { brand: "ZEN GARDEN", block: "HAIR GEL", variant: "250ML (12) WET LOOK" },
      { brand: "KIMIA SUCHI", block: "240ML", variant: "BOTTLES (PCS)" },
    ]);
    expect(products).toHaveLength(1);
    expect(skipped.map((s) => [s.block, s.rows])).toEqual([
      ["HAIR GEL", 2],
      ["240ML", 1],
    ]);
  });
});
