import { describe, expect, it } from "vitest";
import {
  AVATAR_MAX_BYTES,
  avatarRejectionReason,
  displayNameSchema,
  generatedAvatarSchema,
} from "@/lib/validation/profile";

describe("displayNameSchema", () => {
  it("trims surrounding whitespace", () => {
    expect(displayNameSchema.parse("  Aisha Rahman  ")).toBe("Aisha Rahman");
  });

  it("rejects an empty name", () => {
    expect(displayNameSchema.safeParse("").success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    expect(displayNameSchema.safeParse("    ").success).toBe(false);
  });

  it("accepts 120 characters and rejects 121", () => {
    expect(displayNameSchema.safeParse("a".repeat(120)).success).toBe(true);
    expect(displayNameSchema.safeParse("a".repeat(121)).success).toBe(false);
  });
});

describe("generatedAvatarSchema", () => {
  it("accepts one of the five styles", () => {
    expect(
      generatedAvatarSchema.safeParse({ style: "clay", seed: "Aisha Rahman" })
        .success,
    ).toBe(true);
  });

  it("rejects a style outside the five, even a real DiceBear one", () => {
    expect(
      generatedAvatarSchema.safeParse({ style: "lorelei", seed: "x" }).success,
    ).toBe(false);
  });

  it("rejects an empty seed", () => {
    expect(
      generatedAvatarSchema.safeParse({ style: "clay", seed: "" }).success,
    ).toBe(false);
  });
});

describe("avatarRejectionReason", () => {
  it("accepts a reasonable jpeg", () => {
    expect(
      avatarRejectionReason({ type: "image/jpeg", size: 2_000_000 }),
    ).toBeNull();
  });

  it("accepts png and webp", () => {
    expect(avatarRejectionReason({ type: "image/png", size: 1000 })).toBeNull();
    expect(avatarRejectionReason({ type: "image/webp", size: 1000 })).toBeNull();
  });

  it("rejects a pdf, naming what is allowed", () => {
    const reason = avatarRejectionReason({
      type: "application/pdf",
      size: 1000,
    });
    expect(reason).toContain("PNG");
  });

  it("rejects a file over the cap, naming the actual size", () => {
    const reason = avatarRejectionReason({
      type: "image/png",
      size: AVATAR_MAX_BYTES + 1,
    });
    expect(reason).toContain("5.0 MB");
  });

  it("rejects an empty file", () => {
    expect(avatarRejectionReason({ type: "image/png", size: 0 })).not.toBeNull();
  });
});
