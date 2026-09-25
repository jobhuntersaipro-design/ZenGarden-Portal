import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SPLASH_SCREENS, splashMedia, splashPath } from "./splash-screens";

describe("SPLASH_SCREENS", () => {
  it("names one file per screen, with no two screens sharing a query", () => {
    expect(new Set(SPLASH_SCREENS.map(splashPath)).size).toBe(SPLASH_SCREENS.length);
    expect(new Set(SPLASH_SCREENS.map(splashMedia)).size).toBe(SPLASH_SCREENS.length);
  });

  // The layout links every entry; a file the script was not re-run for is a
  // 404 that iOS answers with a white launch, which is the defect this fixes.
  it("has a drawn file in public/ for every entry", () => {
    for (const screen of SPLASH_SCREENS) {
      expect(existsSync(path.join(process.cwd(), "public", splashPath(screen))), splashPath(screen)).toBe(true);
    }
  });
});
