import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getObjectBytes, productThumbKey, r2 } from "@/lib/r2";

/** Its message is written for the user and is shown verbatim. */
export class ProductImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImageError";
  }
}

/**
 * One rendition. 1600px covers the product page gallery on a 2x display, and
 * the original is kept in R2 beside it, so a larger size later is a
 * re-derivation rather than another request for the photographs.
 */
const THUMB_WIDTH = 1600;

/**
 * The declared Content-Type only proves what the client claimed; this is where
 * we find out what actually arrived. A file sharp cannot open is not an image,
 * whatever its header said — the same reasoning as `src/lib/avatar-store.ts`.
 */
async function toWebp(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const out = await sharp(Buffer.from(bytes))
      // EXIF orientation, and sharp drops EXIF on write. Without this every
      // photograph taken in portrait on a phone lands on its side. The avatar
      // path never needed it because a 256px square crop of a face forgives
      // a rotation; a 1600px product shot does not.
      .rotate()
      .resize({
        width: THUMB_WIDTH,
        fit: "inside",
        // A 400px supplier thumbnail stays 400px rather than being upscaled
        // into blur.
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    throw new ProductImageError(
      "We couldn't read that image. Try a different file.",
    );
  }
}

/**
 * Reads the uploaded original from R2, writes the derivative beside it and
 * records both on the row. Returns the stored byte size so the caller can show
 * it without a second read.
 */
export async function storeProductImage(input: {
  imageId: string;
  productId: string;
  r2Key: string;
}): Promise<{ thumbKey: string; sizeBytes: number }> {
  const original = await getObjectBytes(input.r2Key);
  const webp = await toWebp(original);
  const thumbKey = productThumbKey(input.productId, input.imageId);

  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: thumbKey,
      Body: webp,
      ContentType: "image/webp",
    }),
  );

  await prisma.productImage.update({
    where: { id: input.imageId },
    data: { thumbKey, sizeBytes: original.byteLength },
  });

  return { thumbKey, sizeBytes: original.byteLength };
}
