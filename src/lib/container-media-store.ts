import sharp from "sharp";
import { getObjectBytes, putObject } from "@/lib/r2";
import { containerThumbKey } from "@/lib/validation/container-files";

/**
 * A 600px WebP beside a container photo, for the grid. `.rotate()` reads the
 * EXIF orientation sharp drops on write — a portrait phone photo otherwise
 * lands on its side. Null when sharp cannot read it: not an image.
 */
export async function storeContainerThumb(key: string): Promise<string | null> {
  try {
    const original = await getObjectBytes(key);
    const webp = await sharp(Buffer.from(original))
      .rotate()
      .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const thumbKey = containerThumbKey(key);
    await putObject(thumbKey, new Uint8Array(webp), "image/webp");
    return thumbKey;
  } catch (cause) {
    console.error("[containers] thumbnail failed", cause);
    return null;
  }
}
