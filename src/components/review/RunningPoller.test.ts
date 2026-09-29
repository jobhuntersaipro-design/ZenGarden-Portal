import { describe, expect, it, vi } from "vitest";

vi.mock("@/actions/purchase-orders", () => ({ getExtractionStatus: vi.fn() }));
vi.mock("@/hooks/useAwaitableRefresh", () => ({ useAwaitableRefresh: () => vi.fn() }));

const { formatElapsed } = await import("@/components/review/RunningPoller");

describe("formatElapsed (S-12)", () => {
  it("reads minutes and padded seconds", () => {
    expect(formatElapsed(42_000)).toBe("0:42");
    expect(formatElapsed(185_400)).toBe("3:05");
  });

  it("never goes negative when the browser's clock is behind the server's", () => {
    expect(formatElapsed(-3_000)).toBe("0:00");
  });
});
