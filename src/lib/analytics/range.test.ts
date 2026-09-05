import { describe, expect, it } from "vitest";
import {
  matchPreset,
  parseRange,
  presetRange,
  previousPeriod,
} from "@/lib/analytics/range";

// Noon in Kuala Lumpur on 17 September 2026.
const NOW = new Date("2026-09-17T04:00:00Z");
const day = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(date);

describe("presetRange", () => {
  it("makes Last day today only", () => {
    const { from, to } = presetRange("last-day", NOW);
    expect(day(from)).toBe("2026-09-17");
    expect(day(to)).toBe("2026-09-17");
  });

  it("makes Last 30 days inclusive of today, so thirty buckets not thirty-one", () => {
    const { from, to } = presetRange("last-30", NOW);
    expect(day(from)).toBe("2026-08-19");
    expect(day(to)).toBe("2026-09-17");
  });

  it("makes Last 60 days", () => {
    expect(day(presetRange("last-60", NOW).from)).toBe("2026-07-20");
  });

  it("makes Last 3 months and Last year by calendar, not by 90 or 365 days", () => {
    expect(day(presetRange("last-3-months", NOW).from)).toBe("2026-06-17");
    expect(day(presetRange("last-year", NOW).from)).toBe("2025-09-17");
  });
});

describe("parseRange", () => {
  it("defaults to Last 30 days at daily aggregation", () => {
    const range = parseRange({}, NOW);
    expect(range.preset).toBe("last-30");
    expect(range.agg).toBe("day");
    expect(day(range.from)).toBe("2026-08-19");
  });

  it("takes explicit dates over the preset", () => {
    const range = parseRange({ from: "2026-09-01", to: "2026-09-10" }, NOW);
    expect(day(range.from)).toBe("2026-09-01");
    expect(day(range.to)).toBe("2026-09-10");
    expect(range.preset).toBeNull();
  });

  it("marks a custom range that happens to equal a preset as that preset", () => {
    // The chip highlights only on an exact match, so this has to be detected.
    const range = parseRange({ from: "2026-08-19", to: "2026-09-17" }, NOW);
    expect(range.preset).toBe("last-30");
  });

  it("clamps a range reaching into the future to today", () => {
    // Future buckets are empty, and empty buckets look like a collapse.
    const range = parseRange({ from: "2026-09-01", to: "2027-01-01" }, NOW);
    expect(day(range.to)).toBe("2026-09-17");
  });

  it("swaps a backwards range rather than returning nothing", () => {
    const range = parseRange({ from: "2026-09-10", to: "2026-09-01" }, NOW);
    expect(day(range.from)).toBe("2026-09-01");
    expect(day(range.to)).toBe("2026-09-10");
  });

  it("ignores a malformed date and falls back to the preset", () => {
    const range = parseRange({ from: "yesterday", to: "2026-09-10" }, NOW);
    expect(range.preset).toBe("last-30");
  });

  it("accepts each aggregation and rejects anything else", () => {
    expect(parseRange({ agg: "week" }, NOW).agg).toBe("week");
    expect(parseRange({ agg: "quarter" }, NOW).agg).toBe("quarter");
    expect(parseRange({ agg: "fortnightly" }, NOW).agg).toBe("day");
  });
});

describe("previousPeriod", () => {
  it("is the same length again, ending the day before from", () => {
    const range = presetRange("last-30", NOW);
    const previous = previousPeriod(range);
    expect(day(previous.to)).toBe("2026-08-18");
    expect(day(previous.from)).toBe("2026-07-20");
    // Same span, so the comparison is like for like.
    expect(previous.to.getTime() - previous.from.getTime()).toBe(
      range.to.getTime() - range.from.getTime(),
    );
  });
});

describe("matchPreset", () => {
  it("returns null for a range that matches nothing", () => {
    expect(
      matchPreset(new Date("2026-09-01"), new Date("2026-09-03"), NOW),
    ).toBeNull();
  });
});
