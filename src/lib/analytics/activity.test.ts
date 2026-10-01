import { describe, expect, it } from "vitest";
import { ordersPerDay } from "@/lib/analytics/activity";

describe("ordersPerDay", () => {
  const now = new Date("2026-10-01T04:00:00Z"); // noon in Kuala Lumpur

  it("covers 365 days ending today, empty days included", () => {
    const days = ordersPerDay([], now);
    expect(days).toHaveLength(365);
    expect(days[0].date).toBe("2025-10-02");
    expect(days.at(-1)?.date).toBe("2026-10-01");
    expect(days.every((day) => day.count === 0)).toBe(true);
  });

  it("counts orders on their own calendar day and drops the ones outside the year", () => {
    const days = ordersPerDay(
      [
        { poDate: new Date("2026-09-30T00:00:00Z") },
        { poDate: new Date("2026-09-30T00:00:00Z") },
        { poDate: new Date("2026-10-01T00:00:00Z") },
        { poDate: new Date("2024-01-01T00:00:00Z") },
      ],
      now,
    );
    expect(days.find((day) => day.date === "2026-09-30")?.count).toBe(2);
    expect(days.at(-1)?.count).toBe(1);
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBe(3);
  });
});
