import { describe, expect, it } from "vitest";
import {
  NO_FAMILY,
  collisions,
  familyFromDraft,
  familyReport,
  findFamilyCodeCollision,
  groupFamilies,
  proposeFamilies,
  selectFamilies,
  type FamilyCandidate,
} from "@/lib/product-families";
import type { FamilyOption } from "@/lib/queries/product-families";

let seq = 0;
const product = (over: Partial<FamilyCandidate>): FamilyCandidate => ({
  id: `p${++seq}`,
  sku: `SKU-${seq}`,
  name: "ZEN 2.1L — Papaya",
  brand: "Zen Garden",
  variant: "Papaya",
  category: "Shower cream & gel",
  market: "Malaysia",
  needsReview: false,
  familyId: null,
  ...over,
});

describe("proposeFamilies", () => {
  it("puts the same line in two markets into one group — market is not the product", () => {
    const proposal = proposeFamilies([
      product({ market: "Vietnam" }),
      product({ market: "Libya" }),
      product({ name: "ZEN 2.1L — Goat's Milk", variant: "Goat's Milk", market: "Vietnam" }),
    ]);
    expect(proposal.groups).toHaveLength(1);
    const [group] = proposal.groups;
    expect(group.code).toBe("ZEN-SC-2100");
    expect(group.name).toBe("ZEN 2.1L");
    expect(group.size).toBe("2.1L");
    expect(group.markets).toEqual(["Vietnam", "Libya"]);
    expect(group.products).toHaveLength(3);
  });

  it("keeps two lines apart, and blanks the code they would both take", () => {
    const proposal = proposeFamilies([
      product({ name: "ZEN 1L — Papaya" }),
      product({ name: "ZEN 1L SHOWER SCRUB — Papaya" }),
    ]);
    expect(proposal.groups).toHaveLength(2);
    expect(proposal.groups.map((g) => g.proposedCode)).toEqual(["ZEN-SC-1000", "ZEN-SC-1000"]);
    expect(proposal.groups.map((g) => g.code)).toEqual([null, null]);

    const clash = collisions(proposal);
    expect([...clash.keys()]).toEqual(["ZEN-SC-1000"]);
    expect(clash.get("ZEN-SC-1000")?.map((g) => g.line)).toEqual([
      "ZEN 1L",
      "ZEN 1L SHOWER SCRUB",
    ]);
  });

  it("keeps a sizeless line as a group with a sizeless code", () => {
    const proposal = proposeFamilies([
      product({ name: "HAIR GEL — Wet Look", variant: "Wet Look", category: "Hair care" }),
    ]);
    expect(proposal.groups[0].size).toBeNull();
    expect(proposal.groups[0].code).toBe("ZEN-HC");
  });

  it("leaves alone what is unreviewed or already placed, and says why", () => {
    const proposal = proposeFamilies([
      product({ sku: "ZEN/SC/2100/CARROT", needsReview: true, category: "Uncategorised" }),
      product({ sku: "PLACED", familyId: "fam1" }),
      product({}),
    ]);
    expect(proposal.groups).toHaveLength(1);
    expect(proposal.groups[0].products).toHaveLength(1);
    expect(proposal.skipped.map((s) => [s.sku, s.reason])).toEqual([
      ["ZEN/SC/2100/CARROT", "needs review"],
      ["PLACED", "already in a family"],
    ]);
  });

  it("groups a name typed in ops with a name written by the importer", () => {
    // Ops leaves the variant out of the name; the importer appends it. Both
    // are the same line once `groupName` has removed the suffix.
    const proposal = proposeFamilies([
      product({ name: "ZEN 2.1L", variant: "Lavender" }),
      product({ name: "ZEN 2.1L — Papaya", variant: "Papaya" }),
    ]);
    expect(proposal.groups).toHaveLength(1);
  });
});

describe("familyFromDraft", () => {
  it("takes brand and category from the product and the code from all four", () => {
    expect(
      familyFromDraft(
        { name: " Zen Garden Shower Scrub 1L ", size: " 1L ", qualifier: "Scrub" },
        { brand: "Zen Garden", category: "Shower cream & gel" },
      ),
    ).toEqual({
      code: "ZEN-SC-1000-SCRUB",
      name: "Zen Garden Shower Scrub 1L",
      brand: "Zen Garden",
      category: "Shower cream & gel",
      size: "1L",
    });
  });

  it("treats a blank size and qualifier as none", () => {
    const family = familyFromDraft(
      { name: "Hair Gel", size: "  ", qualifier: "" },
      { brand: "Zen Garden", category: "Hair care" },
    );
    expect(family.code).toBe("ZEN-HC");
    expect(family.size).toBeNull();
  });
});

describe("findFamilyCodeCollision", () => {
  const existing: FamilyOption = {
    id: "fam1",
    code: "ZEN-SC-2100",
    name: "Zen Garden Shower Cream 2.1L",
    brand: "Zen Garden",
    category: "Shower cream & gel",
    size: "2.1L",
    products: 30,
  };

  it("finds the family a code belongs to — the case that produced the bug report", () => {
    // A different name for the drafted family cannot disambiguate it: the
    // code is built from brand + category + size alone (Phase 36), so this
    // is exactly the collision the original report hit.
    expect(findFamilyCodeCollision("ZEN-SC-2100", [existing])).toEqual(existing);
  });

  it("compares case-insensitively", () => {
    expect(findFamilyCodeCollision("zen-sc-2100", [existing])).toEqual(existing);
  });

  it("returns null once a qualifier makes the code unique", () => {
    expect(findFamilyCodeCollision("ZEN-SC-2100-SCRUB", [existing])).toBeNull();
  });

  it("returns null for a blank code rather than matching every family", () => {
    expect(findFamilyCodeCollision("", [existing])).toBeNull();
    expect(findFamilyCodeCollision("   ", [existing])).toBeNull();
  });
});

describe("groupFamilies", () => {
  const fam = { id: "f1", code: "ZEN-SC-2100", name: "Zen Garden Shower Cream 2.1L", brand: "Zen Garden", category: "Shower cream & gel", size: "2.1L" };
  const members = [
    { id: "a", market: "Malaysia", active: true, flags: [], family: fam },
    { id: "b", market: "Vietnam", active: true, flags: ["missing-image"], family: fam },
    { id: "c", market: "Vietnam", active: false, flags: ["inactive"], family: fam },
    { id: "d", market: null, active: true, flags: [], family: null },
  ];
  const sales = new Map([
    ["a", [{ purchaseOrderId: "po1", buyerId: "b1", quantity: 10, amount: 100.1 }]],
    ["b", [
      { purchaseOrderId: "po1", buyerId: "b1", quantity: 5, amount: 50.2 },
      { purchaseOrderId: "po2", buyerId: "b2", quantity: 1, amount: 9.9 },
    ]],
  ]);

  it("sums units and revenue and counts orders and buyers across the family, not per variant", () => {
    const [family] = groupFamilies(members, sales);
    expect(family.id).toBe("f1");
    expect(family.variants).toBe(3);
    expect(family.markets).toBe(2);
    expect(family.active).toBe(2);
    expect(family.toFix).toBe(2);
    expect(family.units).toBe(16);
    expect(family.revenue).toBe(160.2);
    // Two variants on po1 is one order from one buyer.
    expect(family.orders).toBe(2);
    expect(family.buyers).toBe(2);
  });

  it("puts products in no family into one last row", () => {
    const rows = groupFamilies(members, sales);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ id: NO_FAMILY, name: "No family", variants: 1, units: 0 });
  });

  it("has no unplaced row when every product is placed", () => {
    const rows = groupFamilies(members.slice(0, 3), sales);
    expect(rows.map((r) => r.id)).toEqual(["f1"]);
  });

  it("counts a null market as one market — a listing with no market is still one listing", () => {
    const noMarket = [
      { id: "e", market: null, active: true, flags: [], family: fam },
      { id: "f", market: null, active: true, flags: [], family: fam },
    ];
    const [family] = groupFamilies(noMarket, new Map());
    expect(family.markets).toBe(1);
  });

  it("counts null and a real market as two markets", () => {
    const mixed = [
      { id: "e", market: null, active: true, flags: [], family: fam },
      { id: "f", market: "Vietnam", active: true, flags: [], family: fam },
    ];
    const [family] = groupFamilies(mixed, new Map());
    expect(family.markets).toBe(2);
  });
});

describe("selectFamilies", () => {
  const rows = groupFamilies(
    [
      { id: "a", market: null, active: true, flags: [], family: { id: "f1", code: "ZEN-SC-2100", name: "Zen Garden Shower Cream 2.1L", brand: "Zen Garden", category: "Shower cream & gel", size: "2.1L" } },
      { id: "b", market: null, active: true, flags: [], family: { id: "f2", code: "MRK-DW-1500", name: "Mr. King Dishwash 1.5L", brand: "Mr. King", category: "Dishwash & cleanser", size: "1.5L" } },
      { id: "c", market: null, active: true, flags: [], family: null },
    ],
    new Map([["b", [{ purchaseOrderId: "po", buyerId: "b", quantity: 3, amount: 30 }]]]),
  );
  const desc = { key: "revenue" as const, dir: "desc" as const };

  it("sorts by revenue and keeps the unplaced row last either way", () => {
    expect(selectFamilies(rows, { sort: desc }).map((r) => r.id)).toEqual(["f2", "f1", NO_FAMILY]);
    expect(selectFamilies(rows, { sort: { ...desc, dir: "asc" } }).map((r) => r.id)).toEqual(["f1", "f2", NO_FAMILY]);
  });

  it("searches the name, the code and the brand", () => {
    expect(selectFamilies(rows, { q: "mrk-dw", sort: desc }).map((r) => r.id)).toEqual(["f2"]);
    expect(selectFamilies(rows, { q: "shower", sort: desc }).map((r) => r.id)).toEqual(["f1"]);
  });

  it("filters by brand and category", () => {
    expect(selectFamilies(rows, { brand: "Mr. King", sort: desc }).map((r) => r.id)).toEqual(["f2"]);
    expect(selectFamilies(rows, { category: "Shower cream & gel", sort: desc }).map((r) => r.id)).toEqual(["f1"]);
  });
});

describe("familyReport", () => {
  it("names every collision with each side's line, count and markets, then the totals", () => {
    const report = familyReport(
      proposeFamilies([
        product({ name: "ZEN 1L — Papaya", market: "Malaysia" }),
        product({ name: "ZEN 1L — Lavender", variant: "Lavender", market: "India" }),
        product({ name: "ZEN 1L SHOWER SCRUB — Papaya" }),
        product({ name: "HAIR GEL", variant: null, category: "Hair care" }),
        product({ sku: "RAW", needsReview: true }),
      ]),
    );
    expect(report).toContain("Collisions — 1 codes");
    expect(report).toContain("  ZEN-SC-1000");
    expect(report).toContain("ZEN 1L  · 2 products · Malaysia, India");
    expect(report).toContain("ZEN 1L SHOWER SCRUB  · 1 products · Malaysia");
    expect(report).toContain("Sizeless — 1 groups");
    expect(report).toContain("Skipped — 1 products");
    expect(report).toContain("RAW");
    expect(report.trim().split("\n").at(-1)).toBe(
      "4 products → 3 groups → 2 codes, 1 collisions, 1 sizeless, 1 skipped.",
    );
  });
});
