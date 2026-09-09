import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// r2.ts builds an S3 client at import time, which needs the full env.
vi.mock("@/lib/env", () => ({
  env: {
    R2_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "bucket",
  },
}));

const { documentKey, isPendingKey, PENDING_KEY_PREFIX, productImageKey, productThumbKey } =
  await import("@/lib/r2");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("documentKey", () => {
  it("folders by Kuala Lumpur year and month", () => {
    vi.setSystemTime(new Date("2026-09-17T04:00:00Z")); // noon in KL
    expect(documentKey("doc123", "pdf")).toBe("po/2026/09/doc123.pdf");
  });

  it("uses the KL date, not UTC, across the day boundary", () => {
    // 23:30 UTC on 30 Sep is 07:30 on 1 Oct in KL (+08:00), so the object
    // belongs to October — bucketing by UTC would file it a month early.
    vi.setSystemTime(new Date("2026-09-30T23:30:00Z"));
    expect(documentKey("doc123", "pdf")).toBe("po/2026/10/doc123.pdf");
  });

  it("normalises the extension", () => {
    vi.setSystemTime(new Date("2026-09-17T04:00:00Z"));
    expect(documentKey("doc123", ".PNG")).toBe("po/2026/09/doc123.png");
  });
});

describe("isPendingKey", () => {
  it("recognises the placeholder a row carries before its real key", () => {
    expect(isPendingKey(`${PENDING_KEY_PREFIX}abc`)).toBe(true);
    expect(isPendingKey("po/2026/09/doc123.pdf")).toBe(false);
  });
});

describe("product image keys", () => {
  it("folders the original under the product and names it by the image id", () => {
    expect(productImageKey("prd1", "img1", "jpg")).toBe("products/prd1/img1.jpg");
  });

  it("normalises the extension, so a leading dot or capitals cannot fork the key", () => {
    expect(productImageKey("prd1", "img1", ".JPG")).toBe("products/prd1/img1.jpg");
  });

  it("derives the thumb key from the same pair, so the two cannot drift", () => {
    expect(productThumbKey("prd1", "img1")).toBe("products/prd1/img1.1600.webp");
  });

  it("matches the shapes documented on the ProductImage model", () => {
    // prisma/schema.prisma comments these exact two shapes; a change here that
    // is not made there leaves the schema lying about its own columns.
    expect(productImageKey("p", "i", "webp")).toMatch(
      /^products\/[^/]+\/[^/]+\.[a-z]+$/,
    );
    expect(productThumbKey("p", "i")).toMatch(/^products\/[^/]+\/[^/]+\.1600\.webp$/);
  });
});
