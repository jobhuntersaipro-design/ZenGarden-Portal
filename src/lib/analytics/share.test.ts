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

describe("shareBy — the Other slice", () => {
  const rows = [
    { id: "a", label: "A", value: 100 },
    { id: "b", label: "B", value: 50 },
    { id: "c", label: "C", value: 30 },
    { id: "d", label: "D", value: 12 },
    { id: "e", label: "E", value: 6 },
    { id: "f", label: "F", value: 1 },
    { id: "g", label: "G", value: 1 },
  ];
  const slices = shareBy(
    rows,
    (row) => ({ id: row.id, label: row.label }),
    (row) => row.value,
  );
  const other = slices[slices.length - 1];

  it("keeps the folded entities so the legend can open them", () => {
    expect(other.isOther).toBe(true);
    expect(other.members?.map((member) => member.id)).toEqual(["f", "g"]);
  });

  it("gives a member its share of the whole, not of Other", () => {
    // 1 of 200 is 0.5%. Of Other alone it would read 50%, which would rank a
    // trivial buyer alongside the leader.
    expect(other.members?.[0].share).toBeCloseTo(0.5);
    expect(other.share).toBeCloseTo(1);
  });

  it("sums its members exactly", () => {
    const summed = (other.members ?? []).reduce((sum, m) => sum + m.value, 0);
    expect(summed).toBe(other.value);
  });

  it("has no members when nothing was folded", () => {
    const short = shareBy(
      rows.slice(0, 3),
      (row) => ({ id: row.id, label: row.label }),
      (row) => row.value,
    );
    expect(short.some((slice) => slice.isOther)).toBe(false);
  });
});
