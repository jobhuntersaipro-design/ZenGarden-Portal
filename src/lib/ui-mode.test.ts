import { describe, expect, it } from "vitest";
import { arcPreviewEnabled, parseUiMode, resolveUiMode } from "./ui-mode";

describe("ui mode", () => {
  it("reads only the two modes", () => {
    expect(parseUiMode("arc")).toBe("arc");
    expect(parseUiMode("classic")).toBe("classic");
    expect(parseUiMode("ARC")).toBeNull();
    expect(parseUiMode(undefined)).toBeNull();
  });

  it("is on everywhere but production", () => {
    expect(arcPreviewEnabled({ VERCEL_ENV: "preview" })).toBe(true);
    expect(arcPreviewEnabled({})).toBe(true);
    expect(arcPreviewEnabled({ VERCEL_ENV: "production" })).toBe(false);
    expect(arcPreviewEnabled({ VERCEL_ENV: "production", ARC_PREVIEW: "1" })).toBe(true);
  });

  it("draws Arc in production whatever the cookie says", () => {
    expect(resolveUiMode("classic", { VERCEL_ENV: "production" })).toBe("arc");
    expect(resolveUiMode(undefined, { VERCEL_ENV: "production" })).toBe("arc");
  });

  it("draws Arc by default elsewhere, and Current only when asked for", () => {
    expect(resolveUiMode(undefined, { VERCEL_ENV: "preview" })).toBe("arc");
    expect(resolveUiMode("nonsense", {})).toBe("arc");
    expect(resolveUiMode("classic", { VERCEL_ENV: "preview" })).toBe("classic");
  });
});
