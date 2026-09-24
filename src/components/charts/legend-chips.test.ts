import { describe, expect, it } from "vitest";
import { legendChips } from "@/components/charts/SeriesTrend";

/** Options come to the legend ranked by value, highest first. */
const ranked = (n: number) =>
  Array.from({ length: n }, (_unused, i) => ({ id: `s${i + 1}` }));

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe("legendChips", () => {
  it("offers every option when they fit", () => {
    expect(ids(legendChips(ranked(4), ["s1", "s2"]))).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
  });

  it("keeps the options' own order rather than putting the drawn ones first", () => {
    // Selected-first ordering would move a chip across the row the moment it
    // was switched on, under the reader's finger.
    expect(ids(legendChips(ranked(4), ["s4", "s2"]))).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
  });

  it("includes a drawn series the cap would otherwise have cut", () => {
    // The failure this guards: taking the top `cap` options drops a selected
    // low-ranked series off the legend while its line is still on the chart.
    const chips = ids(legendChips(ranked(30), ["s28"], 5));
    expect(chips).toContain("s28");
    expect(chips).toEqual(["s1", "s2", "s3", "s4", "s28"]);
  });

  it("fills the rest of the row with the highest-ranked options left", () => {
    expect(ids(legendChips(ranked(30), ["s1"], 4))).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
  });

  it("never offers more than the cap", () => {
    expect(legendChips(ranked(100), [], 10)).toHaveLength(10);
  });

  it("offers something to switch on when nothing is drawn", () => {
    // With no series selected the chart shows its empty state; the legend is
    // how a reader gets out of it without reopening the picker.
    expect(ids(legendChips(ranked(3), []))).toEqual(["s1", "s2", "s3"]);
  });

  it("holds every drawn series even past the cap", () => {
    const chips = ids(legendChips(ranked(30), ["s10", "s20", "s30"], 2));
    expect(chips).toEqual(["s10", "s20", "s30"]);
  });

  it("offers nothing when there is nothing to offer", () => {
    expect(legendChips([], [])).toEqual([]);
  });
});
