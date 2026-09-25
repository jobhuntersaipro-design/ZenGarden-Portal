/**
 * Draws the iPhone launch images into `public/splash/` from the brand badge.
 * Run after the badge or `SPLASH_SCREENS` changes:
 *
 *   npx tsx scripts/make-splash-images.ts
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SPLASH_BADGE, SPLASH_SCREENS, splashPath } from "../src/lib/splash-screens";

const ROOT = path.join(__dirname, "..");
const BADGE = path.join(ROOT, "public/brand/zen-garden-badge.png");

async function main() {
  await mkdir(path.join(ROOT, "public/splash"), { recursive: true });
  for (const screen of SPLASH_SCREENS) {
    const width = screen.width * screen.ratio;
    const height = screen.height * screen.ratio;
    const badgeHeight = SPLASH_BADGE.height * screen.ratio;
    const badge = await sharp(BADGE).resize({ height: badgeHeight }).png().toBuffer();
    const { width: badgeWidth = 0 } = await sharp(badge).metadata();
    const top = Math.round(((screen.height - SPLASH_BADGE.stack) / 2) * screen.ratio);
    const file = path.join(ROOT, "public", splashPath(screen));
    await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
      .composite([{ input: badge, top, left: Math.round((width - badgeWidth) / 2) }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(file);
    console.log(path.relative(ROOT, file));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
