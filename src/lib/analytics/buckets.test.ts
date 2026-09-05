import { describe, expect, it } from "vitest";
import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";

describe("bucketKey", () => {
  it("buckets by the Kuala Lumpur day, not the UTC one", () => {
    // 23:30 UTC on 30 Sep is 07:30 on 1 Oct in KL. Bucketing by UTC would file
    // this a day — and a month — early.
    expect(bucketKey("2026-09-30T23:30:00Z", "day")).toBe("2026-10-01");
    expect(bucketKey("2026-09-30T23:30:00Z", "month")).toBe("2026-10-01");
  });

  it("starts weeks on Monday", () => {
    // 2026-09-17 is a Thursday.
    expect(bucketKey("2026-09-17T04:00:00Z", "week")).toBe("2026-09-14");
  });

  it("buckets a Sunday into the week that started six days earlier", () => {
    // 2026-09-20 is a Sunday.
    expect(bucketKey("2026-09-20T04:00:00Z", "week")).toBe("2026-09-14");
  });

  it("buckets by month, quarter and year", () => {
    expect(bucketKey("2026-09-17T04:00:00Z", "month")).toBe("2026-09-01");
    expect(bucketKey("2026-09-17T04:00:00Z", "quarter")).toBe("2026-07-01");
    expect(bucketKey("2026-09-17T04:00:00Z", "year")).toBe("2026-01-01");
  });
});

describe("makeBuckets", () => {
  it("includes every day in the range, empty ones too", () => {
    const buckets = makeBuckets(
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-05T00:00:00Z"),
      "day",
    );
    expect(buckets.map((b) => b.key)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });

  it("returns one bucket when from and to are the same Kuala Lumpur day", () => {
    // 12:00 and 23:00 KL on 17 Sep. 20:00Z would be 04:00 on the 18th, which
    // is genuinely two days — the timezone is the whole point of this file.
    const buckets = makeBuckets(
      new Date("2026-09-17T04:00:00Z"),
      new Date("2026-09-17T15:00:00Z"),
      "day",
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0].key).toBe("2026-09-17");
  });

  it("does not emit a spurious bucket when the end sits later in the day", () => {
    // 08:00 KL on 1 Sep to 23:00 KL on 5 Sep is five days, not six.
    const buckets = makeBuckets(
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-05T15:00:00Z"),
      "day",
    );
    expect(buckets).toHaveLength(5);
  });

  it("crosses a month end without dropping or duplicating a bucket", () => {
    const buckets = makeBuckets(
      new Date("2026-01-30T00:00:00Z"),
      new Date("2026-03-02T00:00:00Z"),
      "month",
    );
    expect(buckets.map((b) => b.key)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });

  it("crosses a leap day at daily aggregation", () => {
    const buckets = makeBuckets(
      new Date("2028-02-27T00:00:00Z"),
      new Date("2028-03-01T00:00:00Z"),
      "day",
    );
    expect(buckets.map((b) => b.key)).toEqual([
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("labels each aggregation the way its axis reads", () => {
    expect(makeBuckets(new Date("2026-09-17"), new Date("2026-09-17"), "day")[0].label)
      .toBe("17 Sep");
    expect(makeBuckets(new Date("2026-09-17"), new Date("2026-09-17"), "month")[0].label)
      .toBe("Sep 2026");
    expect(makeBuckets(new Date("2026-09-17"), new Date("2026-09-17"), "quarter")[0].label)
      .toBe("Q3 2026");
    expect(makeBuckets(new Date("2026-09-17"), new Date("2026-09-17"), "year")[0].label)
      .toBe("2026");
  });

  it("never runs away on a reversed range", () => {
    const buckets = makeBuckets(
      new Date("2026-09-30T00:00:00Z"),
      new Date("2026-09-01T00:00:00Z"),
      "day",
    );
    expect(buckets).toHaveLength(1);
  });
});
