import { describe, expect, it } from "vitest";
import {
  groupKey,
  groupName,
  groupProducts,
  variantLabels,
  type Groupable,
} from "@/lib/product-groups";

const product = (over: Partial<Groupable> & Pick<Groupable, "id">): Groupable => ({
  sku: `SKU-${over.id}`,
  name: "ZEN 2.1L NORMAL/DIY",
  brand: "Zen Garden",
  variant: null,
  packSize: 6,
  market: null,
  ...over,
});

describe("groupName", () => {
  it("removes the variant the importer appended to the name", () => {
    expect(
      groupName({ name: "1L HAIR SHAMPOO — Goat's Milk", variant: "Goat's Milk" }),
    ).toBe("1L HAIR SHAMPOO");
  });

  it("matches the suffix case-insensitively, because the sheet shouts and the importer does not", () => {
    expect(
      groupName({ name: "ZEN 2.1L NORMAL/DIY — PAPAYA", variant: "Papaya" }),
    ).toBe("ZEN 2.1L NORMAL/DIY");
  });

  it("leaves a name that keeps the variant in its own column alone", () => {
    // How a product typed in ops looks: the name is already shared.
    expect(
      groupName({ name: "Zen Garden Shower Cream 2.1L", variant: "GOAT'S MILK" }),
    ).toBe("Zen Garden Shower Cream 2.1L");
  });

  it("never truncates a name at a dash that is not this product's variant", () => {
    expect(
      groupName({ name: "H/WASH 500ML (7/LAYER X 8) — Kiwi", variant: "Peach" }),
    ).toBe("H/WASH 500ML (7/LAYER X 8) — Kiwi");
  });

  it("keeps the whole name when stripping would leave nothing", () => {
    expect(groupName({ name: "— Papaya", variant: "Papaya" })).toBe("— Papaya");
  });

  it("returns the name unchanged when there is no variant at all", () => {
    expect(groupName({ name: "1L DWASH CAP", variant: null })).toBe("1L DWASH CAP");
  });
});

describe("groupKey", () => {
  it("puts two flavours of the same product in one group", () => {
    const goat = product({ id: "a", name: "ZEN 2.1L NORMAL/DIY — Goat's Milk", variant: "Goat's Milk" });
    const papaya = product({ id: "b", name: "ZEN 2.1L NORMAL/DIY — Papaya", variant: "Papaya" });
    expect(groupKey(goat)).toBe(groupKey(papaya));
  });

  it("keeps two pack sizes of the same cream apart", () => {
    const small = product({ id: "a", packSize: 6 });
    const large = product({ id: "b", packSize: 12 });
    expect(groupKey(small)).not.toBe(groupKey(large));
  });

  it("keeps two markets of the same cream apart", () => {
    const indo = product({ id: "a", market: "Super Indo" });
    const lotus = product({ id: "b", market: "Lotus" });
    expect(groupKey(indo)).not.toBe(groupKey(lotus));
  });

  it("keeps two brands apart", () => {
    const zen = product({ id: "a", brand: "Zen Garden" });
    const therapy = product({ id: "b", brand: "Therapy Level" });
    expect(groupKey(zen)).not.toBe(groupKey(therapy));
  });

  it("groups on the family where one is set, whatever the names say", () => {
    // Ops placed "ZEN 2.1L" and "2.1L ZEN SIGNATURE" in one family; the
    // derived key would have kept them apart.
    const a = product({ id: "a", name: "ZEN 2.1L — Papaya", variant: "Papaya", familyId: "fam1" });
    const b = product({ id: "b", name: "2.1L ZEN SIGNATURE — Carrot", variant: "Carrot", familyId: "fam1" });
    expect(groupKey(a)).toBe(groupKey(b));
  });

  it("still keeps one family apart across two markets and two pack sizes", () => {
    const my = product({ id: "a", familyId: "fam1", market: "Malaysia" });
    const vn = product({ id: "b", familyId: "fam1", market: "Vietnam" });
    const big = product({ id: "c", familyId: "fam1", market: "Malaysia", packSize: 12 });
    expect(groupKey(my)).not.toBe(groupKey(vn));
    expect(groupKey(my)).not.toBe(groupKey(big));
  });

  it("falls back to the derived key for a product in no family", () => {
    const placed = product({ id: "a", familyId: null });
    const unaware = product({ id: "b" });
    expect(groupKey(placed)).toBe(groupKey(unaware));
  });

  it("cannot be fooled by a name whose parts line up with another product's", () => {
    // Brand "A" + name "B C" must not collide with brand "A B" + name "C".
    // A space or a pipe as the separator fails this; a NUL cannot, because no
    // brand or product name can contain one.
    const left = product({ id: "a", brand: "A", name: "B C", packSize: null, market: null });
    const right = product({ id: "b", brand: "A B", name: "C", packSize: null, market: null });
    expect(groupKey(left)).not.toBe(groupKey(right));
  });
});

describe("groupProducts", () => {
  const rows = [
    product({ id: "papaya", name: "ZEN 2.1L NORMAL/DIY — Papaya", variant: "Papaya" }),
    product({ id: "goat", name: "ZEN 2.1L NORMAL/DIY — Goat's Milk", variant: "Goat's Milk" }),
    product({ id: "lone", name: "1L DWASH CAP — Lemon", variant: "Lemon" }),
  ];

  it("collapses the variants into one group and leaves a lone product alone", () => {
    const groups = groupProducts(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe("ZEN 2.1L NORMAL/DIY");
    expect(groups[0].variants.map((v) => v.id)).toEqual(["goat", "papaya"]);
    expect(groups[1].variants.map((v) => v.id)).toEqual(["lone"]);
  });

  it("sorts variants by their label, not by the order they arrived in", () => {
    const groups = groupProducts(rows);
    expect(groups[0].variants.map((v) => v.variant)).toEqual(["Goat's Milk", "Papaya"]);
  });

  it("keeps the order the groups first appeared in, so a sorted input stays sorted", () => {
    const groups = groupProducts([...rows].reverse());
    expect(groups.map((g) => g.name)).toEqual(["1L DWASH CAP", "ZEN 2.1L NORMAL/DIY"]);
  });

  it("carries the group's shared facts, taken from its first member", () => {
    const [group] = groupProducts(rows);
    expect({ brand: group.brand, packSize: group.packSize, market: group.market }).toEqual({
      brand: "Zen Garden",
      packSize: 6,
      market: null,
    });
  });

  it("returns nothing for nothing", () => {
    expect(groupProducts([])).toEqual([]);
  });

  it("titles a group by its family's name where it has one", () => {
    const [group] = groupProducts([
      product({ id: "a", name: "ZEN 2.1L — Papaya", variant: "Papaya", familyId: "fam1", familyName: "Zen Garden Shower Cream 2.1L" }),
    ]);
    expect(group.name).toBe("Zen Garden Shower Cream 2.1L");
  });
});

describe("variantLabels", () => {
  it("labels a variant with its own name", () => {
    const rows = [
      product({ id: "a", variant: "Papaya", sku: "ZEN-PP" }),
      product({ id: "b", variant: "Carrot", sku: "ZEN-CR" }),
    ];
    expect([...variantLabels(rows).values()]).toEqual(["Papaya", "Carrot"]);
  });

  it("appends the SKU when the catalogue holds the same variant twice", () => {
    // The importer's collision suffixes: ZEN-SC-1000-CH beside ZEN-SC-1000-CH-2.
    const rows = [
      product({ id: "a", variant: "Charcoal", sku: "ZEN-SC-1000-CH" }),
      product({ id: "b", variant: "Charcoal", sku: "ZEN-SC-1000-CH-2" }),
    ];
    expect([...variantLabels(rows).values()]).toEqual([
      "Charcoal (ZEN-SC-1000-CH)",
      "Charcoal (ZEN-SC-1000-CH-2)",
    ]);
  });

  it("calls a product with no variant Standard", () => {
    const rows = [product({ id: "a", variant: null, sku: "ONE" })];
    expect(variantLabels(rows).get("a")).toBe("Standard");
  });
});
