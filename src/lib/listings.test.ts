import { describe, expect, it } from "vitest";
import { resolveListing, type ListingCandidate } from "@/lib/listings";

const candidate = (over: Partial<ListingCandidate> & Pick<ListingCandidate, "id">): ListingCandidate => ({
  brand: "Zen Garden",
  name: "Zen Garden Shower Cream 2.1L",
  variant: "Goat's Milk",
  market: "Indonesia",
  familyId: null,
  familyName: null,
  ...over,
});

/** The product being created or edited. */
const entering = {
  brand: "Zen Garden",
  name: "Zen Garden Shower Cream 2.1L",
  variant: "Carrot",
  market: "Indonesia",
};

describe("resolveListing", () => {
  it("finds the family a matching product already carries", () => {
    const match = resolveListing(entering, [
      candidate({ id: "a", familyId: "fam-1", familyName: "Zen Garden Shower Cream 2.1L" }),
    ]);
    expect(match).toEqual({
      kind: "family",
      familyId: "fam-1",
      familyName: "Zen Garden Shower Cream 2.1L",
      members: 1,
    });
  });

  it("counts every member of the family, not just the first", () => {
    const match = resolveListing(entering, [
      candidate({ id: "a", familyId: "fam-1", familyName: "F" }),
      candidate({ id: "b", variant: "Papaya", familyId: "fam-1", familyName: "F" }),
    ]);
    expect(match).toMatchObject({ kind: "family", members: 2 });
  });

  it("reports a derived group that nobody has made a family of", () => {
    const match = resolveListing(entering, [
      candidate({ id: "a" }),
      candidate({ id: "b", variant: "Papaya" }),
    ]);
    expect(match).toEqual({
      kind: "derived",
      title: "Zen Garden Shower Cream 2.1L",
      memberIds: ["a", "b"],
    });
  });

  it("refuses to guess when the matching products carry two families", () => {
    const match = resolveListing(entering, [
      candidate({ id: "a", familyId: "fam-1", familyName: "One" }),
      candidate({ id: "b", familyId: "fam-2", familyName: "Two" }),
    ]);
    expect(match).toEqual({
      kind: "ambiguous",
      families: [
        { id: "fam-1", name: "One" },
        { id: "fam-2", name: "Two" },
      ],
    });
  });

  it("is a new listing when nothing matches", () => {
    expect(resolveListing(entering, [])).toEqual({ kind: "new" });
  });

  it("ignores a candidate in another market", () => {
    // The user's own rule: the same cream for two markets is two listings.
    const match = resolveListing(entering, [
      candidate({ id: "a", market: "Malaysia", familyId: "fam-1", familyName: "F" }),
    ]);
    expect(match).toEqual({ kind: "new" });
  });

  it("ignores a candidate of another brand", () => {
    expect(
      resolveListing(entering, [candidate({ id: "a", brand: "Everfresh" })]),
    ).toEqual({ kind: "new" });
  });

  it("matches across the importer's variant suffix", () => {
    // "ZEN 2.1L — Goat's Milk" and a row named "ZEN 2.1L" are one listing;
    // groupName strips the suffix before the comparison.
    const match = resolveListing(
      { ...entering, name: "ZEN 2.1L", variant: "Carrot" },
      [candidate({ id: "a", name: "ZEN 2.1L — Goat's Milk", variant: "Goat's Milk" })],
    );
    expect(match).toMatchObject({ kind: "derived", memberIds: ["a"] });
  });

  it("does not match a product against itself when editing", () => {
    // The edit drawer passes the row's own id; without this a lone product
    // would report that it joins the listing it already is.
    const match = resolveListing(entering, [candidate({ id: "self" })], "self");
    expect(match).toEqual({ kind: "new" });
  });

  it("still finds the family when editing a product that is already in it", () => {
    const match = resolveListing(
      entering,
      [
        candidate({ id: "self", familyId: "fam-1", familyName: "F" }),
        candidate({ id: "other", variant: "Papaya", familyId: "fam-1", familyName: "F" }),
      ],
      "self",
    );
    expect(match).toMatchObject({ kind: "family", familyId: "fam-1", members: 1 });
  });

  it("names the derived listing by the shared name, not the variant's", () => {
    const match = resolveListing({ ...entering, name: "ZEN 2.1L — Carrot" }, [
      candidate({ id: "a", name: "ZEN 2.1L — Goat's Milk", variant: "Goat's Milk" }),
    ]);
    expect(match).toMatchObject({ title: "ZEN 2.1L" });
  });
});
