import { describe, expect, it } from "vitest";
import { webOrderReference } from "@/lib/web-order-number";

describe("webOrderReference", () => {
  it("pads the sequence to five digits", () => {
    expect(webOrderReference(7, new Date("2026-09-09T10:00:00+08:00"))).toBe(
      "W-2609-00007",
    );
    expect(webOrderReference(12345, new Date("2026-09-09T10:00:00+08:00"))).toBe(
      "W-2609-12345",
    );
  });

  it("does not truncate a sequence past five digits", () => {
    // Gaps are fine and the serial never resets, so this will happen
    // eventually. Better a longer reference than two orders sharing one.
    expect(webOrderReference(123456, new Date("2026-09-09T10:00:00+08:00"))).toBe(
      "W-2609-123456",
    );
  });

  it("takes the month in Kuala Lumpur, like every other date in the portal", () => {
    // 2026-09-30 17:00 UTC is 2026-10-01 01:00 in KL, so the reference is
    // October's. Reading this in UTC would put it in the wrong month for the
    // eight hours either side of midnight.
    expect(webOrderReference(1, new Date("2026-09-30T17:00:00Z"))).toBe(
      "W-2610-00001",
    );
    expect(webOrderReference(1, new Date("2026-09-30T15:00:00Z"))).toBe(
      "W-2609-00001",
    );
  });

  it("is stable for the same inputs", () => {
    const at = new Date("2026-01-05T03:00:00Z");
    expect(webOrderReference(42, at)).toBe(webOrderReference(42, at));
    expect(webOrderReference(42, at)).toBe("W-2601-00042");
  });
});
