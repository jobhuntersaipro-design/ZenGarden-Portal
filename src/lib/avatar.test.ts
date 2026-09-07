import { describe, expect, it } from "vitest";
import { avatarObjectKey, avatarUrl, contentHash, initials } from "@/lib/avatar";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Aisha Rahman")).toBe("AR");
  });

  it("stops at two even with more words", () => {
    expect(initials("Wei Ling Tan")).toBe("WL");
  });

  it("handles a single word", () => {
    expect(initials("Prince")).toBe("P");
  });

  it("ignores runs of whitespace rather than emitting blanks", () => {
    expect(initials("  Aisha   Rahman  ")).toBe("AR");
  });

  it("returns an empty string for an empty or whitespace-only name", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });

  it("uppercases", () => {
    expect(initials("aisha rahman")).toBe("AR");
  });

  it("keeps non-Latin letters as they are", () => {
    expect(initials("陈 伟")).toBe("陈伟");
  });
});

describe("avatar keys and urls", () => {
  it("builds a foldered key with the hash in the filename", () => {
    expect(avatarObjectKey("clx123", "a91f2b3c4d5e")).toBe(
      "avatars/clx123/a91f2b3c4d5e.webp",
    );
  });

  it("builds a url carrying the hash as a cache buster", () => {
    expect(avatarUrl("clx123", "a91f2b3c4d5e")).toBe(
      "/api/avatars/clx123?v=a91f2b3c4d5e",
    );
  });

  it("hashes to twelve lowercase hex characters", () => {
    const hash = contentHash(new Uint8Array([1, 2, 3]));
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it("hashes the same bytes to the same value and different bytes differently", () => {
    expect(contentHash(new Uint8Array([1, 2, 3]))).toBe(
      contentHash(new Uint8Array([1, 2, 3])),
    );
    expect(contentHash(new Uint8Array([1, 2, 3]))).not.toBe(
      contentHash(new Uint8Array([1, 2, 4])),
    );
  });
});
