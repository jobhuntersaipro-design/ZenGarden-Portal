import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bucketStart,
  dateColumnRange,
  formatDate,
  formatDateTime,
  rangeFromPreset,
  todayISO,
} from "@/lib/dates";
import { bucketKey } from "@/lib/analytics/buckets";

describe("formatDate", () => {
  it("renders the canvas format", () => {
    expect(formatDate("2026-08-05T04:00:00Z")).toBe("5 Aug 2026");
  });

  it("uses KL time, not UTC", () => {
    // 23:30 UTC is already the next day in Kuala Lumpur (UTC+8).
    expect(formatDate("2026-08-05T23:30:00Z")).toBe("6 Aug 2026");
  });
});

describe("formatDateTime", () => {
  it("is 24-hour and KL-local", () => {
    expect(formatDateTime("2026-09-04T09:05:00Z")).toBe("4 Sep 2026, 17:05");
  });
});

describe("bucketStart", () => {
  it("starts weeks on Monday", () => {
    // 2026-09-05 is a Saturday.
    expect(formatDate(bucketStart("2026-09-05T02:00:00Z", "week"))).toBe("31 Aug 2026");
  });

  it("buckets by month, quarter and year", () => {
    expect(formatDate(bucketStart("2026-08-17T02:00:00Z", "month"))).toBe("1 Aug 2026");
    expect(formatDate(bucketStart("2026-08-17T02:00:00Z", "quarter"))).toBe("1 Jul 2026");
    expect(formatDate(bucketStart("2026-08-17T02:00:00Z", "year"))).toBe("1 Jan 2026");
  });
});

describe("rangeFromPreset", () => {
  it("counts the last 30 days inclusive of today", () => {
    const { from, to } = rangeFromPreset("last-30", "2026-09-03T06:00:00Z");
    expect(formatDate(from)).toBe("5 Aug 2026");
    expect(formatDate(to)).toBe("3 Sep 2026");
  });

  it("treats last-day as today only", () => {
    const { from, to } = rangeFromPreset("last-day", "2026-09-03T06:00:00Z");
    expect(formatDate(from)).toBe(formatDate(to));
  });

  it("runs ytd from 1 January", () => {
    const { from } = rangeFromPreset("ytd", "2026-09-03T06:00:00Z");
    expect(formatDate(from)).toBe("1 Jan 2026");
  });
});

describe("todayISO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives today's date in Kuala Lumpur, not UTC", () => {
    vi.useFakeTimers();
    // 23:30 UTC on 5 Sep is 07:30 on 6 Sep in KL. A UTC-derived default would
    // pre-fill yesterday for anyone working before 08:00.
    vi.setSystemTime(new Date("2026-09-05T23:30:00Z"));
    expect(todayISO()).toBe("2026-09-06");
  });

  it("agrees with UTC in the middle of the KL day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T04:00:00Z"));
    expect(todayISO()).toBe("2026-09-17");
  });
});

describe("dateColumnRange", () => {
  it("keeps the Kuala Lumpur calendar day at the start of the range", () => {
    // The bug this exists for: `poDate` is `@db.Date`, and a timestamp
    // parameter is truncated to a UTC calendar date to compare against it.
    // Midnight on 8 Aug in KL is 2026-08-07T16:00Z, whose UTC date is the 7th
    // — so `gte` admitted a whole extra day and the dashboard's KPI counted 38
    // orders while its daily chart, bucketed in KL, drew 35.
    const from = new Date("2026-08-07T16:00:00.000Z"); // 8 Aug 00:00 KL
    const to = new Date("2026-09-06T15:59:59.999Z"); // 6 Sep 23:59 KL
    const bounds = dateColumnRange({ from, to });

    expect(bounds.gte.toISOString()).toBe("2026-08-08T00:00:00.000Z");
    expect(bounds.lte.toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });

  it("is a no-op for bounds already on a UTC day boundary", () => {
    const bounds = dateColumnRange({
      from: new Date("2026-08-08T00:00:00.000Z"),
      to: new Date("2026-09-06T00:00:00.000Z"),
    });
    expect(bounds.gte.toISOString()).toBe("2026-08-08T00:00:00.000Z");
    expect(bounds.lte.toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });

  it("agrees with the chart's bucket keys at both ends", () => {
    const from = new Date("2026-08-07T16:00:00.000Z");
    const to = new Date("2026-09-06T15:59:59.999Z");
    const bounds = dateColumnRange({ from, to });
    // What the axis calls the first and last bucket.
    expect(bucketKey(bounds.gte, "day")).toBe(bucketKey(from, "day"));
    expect(bucketKey(bounds.lte, "day")).toBe(bucketKey(to, "day"));
  });
});
