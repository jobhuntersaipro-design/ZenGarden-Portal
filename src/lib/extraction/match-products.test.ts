import { describe, expect, it } from "vitest";
import {
  buildIdf,
  matchLine,
  parseSize,
  scoreLine,
  tokenise,
  STRONG_MATCH,
  SUGGEST_MIN,
  type CatalogueEntry,
} from "@/lib/extraction/match-products";

const entry = (over: Partial<CatalogueEntry> & { id: string }): CatalogueEntry => ({
  sku: "ZEN-SC-2100-GM-VN",
  name: "Zen Garden shower cream 2.1L goat's milk",
  brand: "ZEN GARDEN",
  variant: "Goat's Milk",
  market: "Vietnam",
  packSize: 6,
  unit: "carton",
  ...over,
});

describe("tokenise", () => {
  it("treats a period as a separator, so a smushed code keeps its words", () => {
    // sku.ts strips "." so that Goat's becomes goats. Applied to a code that
    // yields "rjelly2lt" and the distinctive token "jelly" is lost.
    expect(tokenise("ZENSC-R.JELLY2LT")).toEqual(["zensc", "r", "jelly", "2", "lt"]);
  });

  it("still strips an apostrophe, so Goat's and Goats are one token", () => {
    expect(tokenise("Goat's Milk")).toEqual(["goats", "milk"]);
  });
});

describe("parseSize", () => {
  it.each([
    ["2.1L", 2100],
    ["500ML", 500],
    ["2.9KG", 2900],
    ["60ML", 60],
    ["ZENSC-R.JELLY2LT", 2000],
    ["EVERFRESH B SHAMPOO LVD& CHAMOMILE 2.1L", 2100],
  ])("reads %s as %i", (input, expected) => {
    expect(parseSize(input as string)).toBe(expected);
  });

  it("does not read GM as grams — that is Goat's Milk", () => {
    expect(parseSize("ZEN-SC-2100-GM-VN")).toBeNull();
  });

  it("has no size to read in a plain description", () => {
    expect(parseSize("Shower cream")).toBeNull();
  });
});

describe("scoreLine — the identity branch", () => {
  const idf = buildIdf([entry({ id: "p1" })]);

  it("scores an exact code 100", () => {
    expect(
      scoreLine({ description: "anything", sku: "zen-sc-2100-gm-vn" }, entry({ id: "p1" }), idf),
    ).toBe(100);
  });

  it("scores a code differing only in separators 96", () => {
    expect(
      scoreLine(
        { description: "", sku: "ZEN/SC/2100/CARROT" },
        entry({ id: "p1", sku: "ZEN.SC.2100.CARROT" }),
        idf,
      ),
    ).toBe(96);
  });

  it("survives a code carrying a space", () => {
    expect(
      scoreLine(
        { description: "", sku: "KE218441 68216" },
        entry({ id: "p1", sku: "KE218441 68216" }),
        idf,
      ),
    ).toBe(100);
  });

  it("scores an exact name 92 when no code is printed", () => {
    expect(
      scoreLine(
        { description: "Zen Garden shower cream 2.1L goat's milk", sku: null },
        entry({ id: "p1" }),
        idf,
      ),
    ).toBe(92);
  });

  it("never reaches 96 for codes that differ by more than separators", () => {
    // CARROT and CR are different strings. This pair is real — production
    // holds both — and it belongs to the similarity branch, not identity.
    const score = scoreLine(
      { description: "", sku: "ZEN/SC/2100/CARROT" },
      entry({ id: "p1", sku: "ZEN-SC-2100-CR", variant: "Carrot", name: "Zen Garden shower cream 2.1L carrot" }),
      idf,
    );
    expect(score).toBeLessThan(96);
  });
});

describe("scoreLine — size", () => {
  const catalogue = [
    entry({ id: "big", name: "Everfresh B shampoo lavender & chamomile 2.1L", sku: "EVF-HC-2100-LV-MY", brand: "Everfresh", variant: "Lavender" }),
    entry({ id: "small", name: "Everfresh B shampoo lavender & chamomile 500ML", sku: "EVF-HC-0500-LV-MY", brand: "Everfresh", variant: "Lavender" }),
  ];
  const idf = buildIdf(catalogue);
  const line = { description: "EVERFRESH B SHAMPOO LVD& CHAMOMILE 2.1L", sku: null };

  it("scores the matching size above the mismatched one", () => {
    expect(scoreLine(line, catalogue[0], idf)).toBeGreaterThan(
      scoreLine(line, catalogue[1], idf),
    );
  });

  it("caps a size mismatch at 40 however much wording agrees", () => {
    // These two share every word they have. Without the cap, token overlap
    // alone ranks the wrong size first and misprices the order.
    expect(scoreLine(line, catalogue[1], idf)).toBeLessThanOrEqual(40);
  });
});

describe("scoreLine — a generic description against a crowded catalogue", () => {
  it("reaches no strong match, because four of its words are shared by everything", () => {
    const catalogue = Array.from({ length: 200 }, (_, i) =>
      entry({
        id: `p${i}`,
        sku: `ZEN-SC-2100-V${i}`,
        name: `Zen Garden shower cream 2.1L variant ${i}`,
        variant: `Variant ${i}`,
      }),
    );
    const idf = buildIdf(catalogue);
    const line = { description: "ZEN GARDEN SHOWER CREAM", sku: null };
    for (const candidate of catalogue) {
      expect(scoreLine(line, candidate, idf)).toBeLessThan(STRONG_MATCH);
    }
  });
});

describe("scoreLine — a smushed code", () => {
  it("ranks its royal-jelly row above every other shower cream", () => {
    const catalogue = [
      entry({ id: "jelly", sku: "ZEN-SC-2000-RJ-MY", name: "Zen shower cream royal jelly 2L", variant: "Royal Jelly" }),
      entry({ id: "milk", sku: "ZEN-SC-2000-GM-MY", name: "Zen shower cream goat's milk 2L", variant: "Goat's Milk" }),
      entry({ id: "lav", sku: "ZEN-SC-2000-LV-MY", name: "Zen shower cream lavender 2L", variant: "Lavender" }),
    ];
    const idf = buildIdf(catalogue);
    const line = { description: "", sku: "ZENSC-R.JELLY2LT" };
    const scores = catalogue.map((c) => scoreLine(line, c, idf));
    expect(Math.max(...scores)).toBe(scores[0]);
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });
});

describe("buildIdf", () => {
  it("weights a rare token above a ubiquitous one", () => {
    const catalogue = [
      entry({ id: "a", name: "Zen shower cream chamomile", variant: "Chamomile" }),
      entry({ id: "b", name: "Zen shower cream lavender", variant: "Lavender" }),
      entry({ id: "c", name: "Zen shower cream lemon", variant: "Lemon" }),
    ];
    const idf = buildIdf(catalogue);
    expect(idf("chamomile")).toBeGreaterThan(idf("shower"));
    expect(idf("shower")).toBe(0);
  });
});

describe("matchLine", () => {
  // Distinct variant words on purpose. Numbered variants ("Chamomile 1",
  // "Chamomile 2") share every distinctive token, so every candidate falls
  // below SUGGEST_MIN and the assertions below pass against an empty array
  // while proving nothing.
  const VARIANTS = ["chamomile", "lavender", "lemon", "carrot", "avocado", "collagen"];
  const catalogue = VARIANTS.map((variant, i) =>
    entry({
      id: `p${i}`,
      sku: `ZEN-SC-2100-V${i}`,
      name: `Zen Garden shower cream 2.1L ${variant}`,
      variant,
    }),
  );
  const idf = buildIdf(catalogue);

  it("returns nothing for a line with no description and no code", () => {
    expect(matchLine({ description: "   ", sku: null }, catalogue, idf)).toEqual([]);
  });

  it("ranks the variant the line names first, and offers at most five", () => {
    const found = matchLine(
      { description: "Zen Garden shower cream 2.1L lemon", sku: null },
      catalogue,
      idf,
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(5);
    expect(found[0].productId).toBe("p2");
    expect(found).toEqual([...found].sort((a, b) => b.score - a.score));
  });

  it("offers nothing below the suggestion threshold", () => {
    const found = matchLine({ description: "delivery charge", sku: null }, catalogue, idf);
    expect(found.every((c) => c.score >= SUGGEST_MIN)).toBe(true);
  });

  it("offers both of two products differing only by market, scoring equally", () => {
    const pair = [
      entry({ id: "my", sku: "ZEN-SC-2100-GM-MY", market: "Malaysia" }),
      entry({ id: "vn", sku: "ZEN-SC-2100-GM-VN", market: "Vietnam" }),
    ];
    const pairIdf = buildIdf(pair);
    const found = matchLine(
      { description: "Zen Garden shower cream 2.1L goat's milk", sku: null },
      pair,
      pairIdf,
    );
    expect(found).toHaveLength(2);
    expect(found[0].score).toBe(found[1].score);
  });
});
