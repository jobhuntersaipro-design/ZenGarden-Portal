import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { TEST_ID_PREFIX, isTestId, confirmationMatches, isProduction, stageForAge } =
  await import("@/lib/test-data");

describe("the test-data tag", () => {
  /**
   * The one that matters: delete keys on this prefix alone, so a cuid — what
   * every row the running app writes gets — must never match. A real
   * purchase order deleted by a testing tool is not recoverable.
   */
  it("never matches a cuid", () => {
    for (const id of [
      "cmu4bso97000052otzg7ccpyd",
      "po_u3q5jfok39ed69ytblfq",
      "clx0000000000000000000000",
      "tuv12345",
    ]) {
      expect(isTestId(id)).toBe(false);
    }
  });

  it("matches what the generator mints", () => {
    expect(isTestId(`${TEST_ID_PREFIX}abc123`)).toBe(true);
  });
});

describe("the production gate", () => {
  const original = process.env.VERCEL_ENV;
  afterEach(() => {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  });

  it("knows production from preview and local", () => {
    process.env.VERCEL_ENV = "production";
    expect(isProduction()).toBe(true);
    process.env.VERCEL_ENV = "preview";
    expect(isProduction()).toBe(false);
    delete process.env.VERCEL_ENV;
    expect(isProduction()).toBe(false);
  });

  /**
   * Forgiving about case and stray spaces, because the point is one
   * deliberate act rather than a typing test — but it must not accept an
   * empty string, which is what a caller that never asked would send.
   */
  it("accepts the word typed, and nothing else", () => {
    expect(confirmationMatches("production")).toBe(true);
    expect(confirmationMatches("  Production ")).toBe(true);
    for (const wrong of ["", "   ", "prod", "productions", "yes"]) {
      expect(confirmationMatches(wrong)).toBe(false);
    }
  });
});

describe("stageForAge", () => {
  it("puts new orders early and old ones delivered", () => {
    expect(stageForAge(0)).toBe("ORDER_PLACED");
    expect(stageForAge(120)).toBe("DELIVERED");
  });
});
