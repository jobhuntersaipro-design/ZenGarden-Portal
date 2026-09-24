import { describe, expect, it } from "vitest";
import {
  labelledIndices,
  rotateSeriesLabels,
} from "@/components/charts/labels";

/** `rotateSeriesLabels` returns sets; compare them as sorted arrays. */
const at = (labelled: Map<string, Set<number>>, key: string) =>
  [...(labelled.get(key) ?? [])].sort((a, b) => a - b);

/** Every labelled bucket on the chart, whichever series claimed it. */
const everyLabelledBucket = (labelled: Map<string, Set<number>>) =>
  [...labelled.values()].flatMap((set) => [...set]).sort((a, b) => a - b);

const flat = (length: number, value = 100) =>
  Array.from({ length }, () => value);

describe("labelledIndices — one series, the four single-line charts", () => {
  it("labels every bucket at step 1", () => {
    expect([...labelledIndices([1, 2, 3], 1)]).toEqual([0, 1, 2]);
  });

  it("keeps labels at least step apart", () => {
    expect([...labelledIndices(flat(10), 3)]).toEqual([0, 3, 6, 9]);
  });

  it("draws nothing until the container has reported a width", () => {
    // `useLabelStep` returns 0 before its first resize. Labelling everything
    // and then thinning it would flash a solid block of figures.
    expect([...labelledIndices(flat(10), 0)]).toEqual([]);
  });

  it("never labels a zero or an absent bucket", () => {
    expect([...labelledIndices([0, null, undefined, 5], 1)]).toEqual([3]);
  });

  it("walks the busy buckets rather than sampling every nth", () => {
    // The 2026-09-06 defect: sampling indices 0, 3, 6 here labels nothing at
    // all, because every busy day falls between the samples.
    const values = [0, 5, 0, 0, 7, 0, 0, 9, 0];
    expect([...labelledIndices(values, 3)]).toEqual([1, 4, 7]);
  });
});

describe("rotateSeriesLabels — the several-series charts", () => {
  it("gives each bucket to at most one series, so two figures never share an x", () => {
    // The shipped defect this replaces: three markets each labelling bucket 0
    // printed three figures on top of each other.
    const labelled = rotateSeriesLabels(
      [
        { key: "a", values: flat(12) },
        { key: "b", values: flat(12) },
        { key: "c", values: flat(12) },
      ],
      2,
    );
    const every = everyLabelledBucket(labelled);
    expect(new Set(every).size).toBe(every.length);
  });

  it("keeps any two figures step apart, whichever lines they belong to", () => {
    const labelled = rotateSeriesLabels(
      [
        { key: "a", values: flat(24) },
        { key: "b", values: flat(24) },
        { key: "c", values: flat(24) },
        { key: "d", values: flat(24) },
      ],
      3,
    );
    const every = everyLabelledBucket(labelled);
    expect(every.length).toBeGreaterThan(1);
    for (let i = 1; i < every.length; i += 1) {
      expect(every[i] - every[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });

  it("shares the slots out in turn rather than letting the first line take them all", () => {
    // A rule that gave every slot to whoever came first would leave the lower
    // series with no figures at all, which reads as "this line has no data".
    const labelled = rotateSeriesLabels(
      [
        { key: "a", values: flat(12) },
        { key: "b", values: flat(12) },
        { key: "c", values: flat(12) },
      ],
      2,
    );
    expect(at(labelled, "a")).toEqual([0, 6]);
    expect(at(labelled, "b")).toEqual([2, 8]);
    expect(at(labelled, "c")).toEqual([4, 10]);
  });

  it("passes the slot on when it is a line's turn but it has nothing to print", () => {
    // `b` rests at zero throughout, so its turns fall to `c` instead of being
    // spent on a bucket that would print nothing.
    const labelled = rotateSeriesLabels(
      [
        { key: "a", values: flat(9) },
        { key: "b", values: flat(9, 0) },
        { key: "c", values: flat(9) },
      ],
      2,
    );
    expect(at(labelled, "b")).toEqual([]);
    expect(everyLabelledBucket(labelled)).toEqual([0, 2, 4, 6, 8]);
  });

  it("skips a bucket every line is quiet in without spending the spacing", () => {
    const quiet = [0, 0, 0, 0];
    const labelled = rotateSeriesLabels(
      [
        { key: "a", values: [...quiet, 5, 5] },
        { key: "b", values: [...quiet, 7, 7] },
      ],
      2,
    );
    // The four empty buckets cost nothing: both busy ones are still labelled.
    expect(everyLabelledBucket(labelled)).toEqual([4]);
    expect(at(labelled, "a")).toEqual([4]);
  });

  it("returns a set per series even when there is nothing to draw", () => {
    // The caller reads `labelled.get(id)` per line; a missing key would make
    // a line silently unlabelled rather than deliberately so.
    const labelled = rotateSeriesLabels(
      [
        { key: "a", values: flat(4) },
        { key: "b", values: flat(4) },
      ],
      0,
    );
    expect([...labelled.keys()]).toEqual(["a", "b"]);
    expect(everyLabelledBucket(labelled)).toEqual([]);
  });

  it("reduces to the single-series walk when one line is drawn", () => {
    // `labelledIndices` delegates here, so this is the guard that the four
    // single-line charts did not change behaviour.
    const values = [0, 5, 0, 0, 7, 0, 0, 9, 0];
    expect(
      at(rotateSeriesLabels([{ key: "only", values }], 3), "only"),
    ).toEqual([...labelledIndices(values, 3)]);
  });
});
