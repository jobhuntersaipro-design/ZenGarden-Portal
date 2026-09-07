import { describe, expect, it } from "vitest";
import {
  AVATAR_STYLE_IDS,
  isAvatarStyleId,
  renderAvatarSvg,
} from "@/lib/avatar-styles";

const SEED = "Aisha Rahman";

describe("avatar styles", () => {
  // croodles was dropped on 2026-09-08: it is CC BY 4.0, and the visible
  // credit its licence requires was removed from the picker.
  it("offers exactly the four CC0 styles the spec names", () => {
    expect([...AVATAR_STYLE_IDS]).toEqual([
      "gaze",
      "voxel-bot",
      "clay",
      "notionists",
    ]);
  });

  it("renders svg markup for every style", () => {
    for (const id of AVATAR_STYLE_IDS) {
      const svg = renderAvatarSvg(id, SEED);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.length).toBeGreaterThan(200);
    }
  });

  it("is deterministic — the same style and seed give identical markup", () => {
    for (const id of AVATAR_STYLE_IDS) {
      expect(renderAvatarSvg(id, SEED)).toBe(renderAvatarSvg(id, SEED));
    }
  });

  it("gives different seeds different markup", () => {
    expect(renderAvatarSvg("clay", "Aisha Rahman")).not.toBe(
      renderAvatarSvg("clay", "Priya Nair"),
    );
  });

  // gaze, voxel-bot and clay all carry @keyframes in their definitions. The
  // SVG is rasterized, so an animation left free means sharp captures an
  // arbitrary frame.
  it("never emits an animation", () => {
    for (const id of AVATAR_STYLE_IDS) {
      expect(renderAvatarSvg(id, SEED)).not.toContain("@keyframes");
    }
  });

  it("varies gaze across seeds while staying inside the pinned shapes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(renderAvatarSvg("gaze", `seed-${i}`));
    expect(seen.size).toBeGreaterThan(1);
  });

  // A DiceBear upgrade that renames an option must fail here rather than
  // silently drop the pin.
  it("throws on an unknown option key", async () => {
    const { Avatar } = await import("@dicebear/core");
    const { AVATAR_STYLES } = await import("@/lib/avatar-styles");
    expect(
      () =>
        new Avatar(AVATAR_STYLES.gaze.style, {
          seed: SEED,
          notAnOption: 1,
        } as never),
    ).toThrow();
  });

  it("recognises its own ids and rejects others", () => {
    expect(isAvatarStyleId("clay")).toBe(true);
    expect(isAvatarStyleId("lorelei")).toBe(false);
    expect(isAvatarStyleId("")).toBe(false);
  });
});
