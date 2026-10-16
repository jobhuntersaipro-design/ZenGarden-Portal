import { describe, expect, it } from "vitest";
import {
  containerMediaMatches,
  containerMediaRejection,
  containerMediaType,
  isContainerMediaKey,
} from "@/lib/validation/container-files";

describe("container media", () => {
  it("takes photos and videos by type or extension, and nothing else", () => {
    expect(containerMediaType("a.MOV", "")).toBe("video/quicktime");
    expect(containerMediaType("a.jpg", "image/jpeg")).toBe("image/jpeg");
    expect(containerMediaType("a.heic", "image/heic")).toBeNull();
    expect(containerMediaType("a.pdf", "application/pdf")).toBeNull();
  });

  it("holds photos to 15 MB and videos to 200 MB", () => {
    expect(containerMediaRejection({ name: "a.jpg", type: "image/jpeg", size: 16 * 1024 * 1024 })).toMatch(/limit/);
    expect(containerMediaRejection({ name: "a.mp4", type: "video/mp4", size: 150 * 1024 * 1024 })).toBeNull();
    expect(containerMediaRejection({ name: "a.mp4", type: "video/mp4", size: 201 * 1024 * 1024 })).toMatch(/limit/);
  });

  it("checks the bytes", () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(containerMediaMatches("video/mp4", mp4)).toBe(true);
    expect(containerMediaMatches("image/jpeg", mp4)).toBe(false);
  });

  it("accepts only keys minted for that container", () => {
    const key = "containers/c1/123e4567-e89b-12d3-a456-426614174000.mp4";
    expect(isContainerMediaKey(key, "c1", "mp4")).toBe(true);
    expect(isContainerMediaKey(key, "c2", "mp4")).toBe(false);
  });
});
