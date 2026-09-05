import { describe, expect, it } from "vitest";
import { shareBy } from "@/lib/analytics/share";

type Row = { id: string; name: string; value: number };
const rows = (...entries: [string, number][]): Row[] =>
  entries.map(([id, value]) => ({ id, name: id.toUpperCase(), value }));

const identity = (row: Row) => ({ id: row.id, label: row.name });
const value = (row: Row) => row.value;

describe("shareBy", () => {
  it("ranks by value and computes each share of the whole", () => {
    const slices = shareBy(rows(["a", 50], ["b", 30], ["c", 20]), identity, value);
    expect(slices.map((s) => s.label)).toEqual(["A", "B", "C"]);
    expect(slices.map((s) => s.share)).toEqual([50, 30, 20]);
  });

  it("sums repeated keys before ranking", () => {
    const slices = shareBy(rows(["a", 10], ["b", 30], ["a", 40]), identity, value);
    expect(slices[0]).toMatchObject({ label: "A", value: 50 });
  });

  it("folds everything past the top N into one Other slice", () => {
    // A ninth series is never a generated hue — it folds.
    const slices = shareBy(
      rows(["a", 60], ["b", 50], ["c", 40], ["d", 30], ["e", 20], ["f", 6], ["g", 4]),
      identity,
      value,
    );
    expect(slices).toHaveLength(6);
    const other = slices[5];
    expect(other.label).toBe("Other (2)");
    expect(other.value).toBe(10);
    expect(other.isOther).toBe(true);
  });

  it("adds no Other slice when everything fits", () => {
    const slices = shareBy(rows(["a", 1], ["b", 1]), identity, value);
    expect(slices.some((s) => s.isOther)).toBe(false);
  });

  it("shares always add up to 100", () => {
    const slices = shareBy(
      rows(["a", 7], ["b", 11], ["c", 13], ["d", 17], ["e", 19], ["f", 23]),
      identity,
      value,
    );
    const summed = slices.reduce((sum, slice) => sum + slice.share, 0);
    expect(summed).toBeCloseTo(100, 6);
  });

  it("skips rows with no identity", () => {
    const slices = shareBy(
      rows(["a", 10], ["b", 10]),
      (row) => (row.id === "b" ? null : identity(row)),
      value,
    );
    expect(slices).toHaveLength(1);
    expect(slices[0].share).toBe(100);
  });

  it("returns nothing for no rows, and does not divide by zero", () => {
    expect(shareBy([], identity, value)).toEqual([]);
    const zeroes = shareBy(rows(["a", 0], ["b", 0]), identity, value);
    expect(zeroes.every((s) => s.share === 0)).toBe(true);
  });
});
