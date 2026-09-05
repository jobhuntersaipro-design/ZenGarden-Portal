import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bucketStart,
  formatDate,
  formatDateTime,
  rangeFromPreset,
  todayISO,
} from "@/lib/dates";

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
