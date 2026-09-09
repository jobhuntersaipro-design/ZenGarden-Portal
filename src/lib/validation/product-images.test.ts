import { describe, expect, it } from "vitest";
import {
  MAX_IMAGES_PER_PRODUCT,
  extensionFor,
  rejectionReason,
} from "@/lib/validation/product-images";

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "ZEN-SC-2100-GM-MY.jpg",
  type: "image/jpeg",
  size: 900_000,
  ...over,
});

describe("rejectionReason", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("accepts %s", (type) => {
    expect(rejectionReason(file({ type }), 0)).toBeNull();
  });

  it("refuses a PDF — a product photo is not a document", () => {
    expect(rejectionReason(file({ type: "application/pdf" }), 0)).toMatch(
      /PNG, JPG or WebP/,
    );
  });

  it("names the actual size, because 'too large' leaves the user guessing", () => {
    const reason = rejectionReason(file({ size: 6 * 1024 * 1024 }), 0);
    expect(reason).toMatch(/6\.0 MB/);
    expect(reason).toMatch(/5\.0 MB/);
  });

  it("refuses the ninth image, counting the ones already there", () => {
    expect(rejectionReason(file(), MAX_IMAGES_PER_PRODUCT - 1)).toBeNull();
    expect(rejectionReason(file(), MAX_IMAGES_PER_PRODUCT)).toMatch(
      /already has 8 images/,
    );
  });

  it("refuses an empty file", () => {
    expect(rejectionReason(file({ size: 0 }), 0)).toMatch(/empty/i);
  });

  it("refuses a name longer than the column allows", () => {
    expect(rejectionReason(file({ name: "a".repeat(256) }), 0)).toMatch(/too long/i);
  });
});

describe("extensionFor", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ])("%s -> %s", (mime, ext) => {
    expect(extensionFor(mime as Parameters<typeof extensionFor>[0])).toBe(ext);
  });
});
