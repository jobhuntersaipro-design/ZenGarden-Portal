import sharp from "sharp";
import type { Metadata, Sharp } from "sharp";
import { contentHash } from "@/lib/avatar";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { deleteObject, putObject } from "@/lib/r2";
import {
  LOGO_BOX,
  LOGO_MAX_SOURCE_DIMENSION,
  LOGO_WRONG_TYPE,
  buyerLogoKey,
  buyerLogoUrl,
} from "@/lib/validation/buyer-files";

/** Its message is written for the person uploading and is shown verbatim. */
export class LogoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogoError";
  }
}

/**
 * Fitted *inside* the box, never cropped: a logo cut to a square loses the
 * half of a wide wordmark that says who the company is — the avatar's
 * `cover` would be wrong here. PNG rather than WebP because the same bytes go
 * into emails, and Outlook does not draw WebP. Transparency is kept.
 */
async function toPng(bytes: Uint8Array) {
  let image: Sharp;
  let meta: Metadata;
  try {
    image = sharp(Buffer.from(bytes)).rotate();
    meta = await image.metadata();
  } catch {
    throw new LogoError(LOGO_WRONG_TYPE);
  }
  const { width = 0, height = 0 } = meta;
  if (!width || !height) throw new LogoError(LOGO_WRONG_TYPE);
  if (width > LOGO_MAX_SOURCE_DIMENSION || height > LOGO_MAX_SOURCE_DIMENSION) {
    throw new LogoError(
      `That image is ${width}×${height} — a logo should be under ${LOGO_MAX_SOURCE_DIMENSION}px on each side`,
    );
  }
  const { data, info } = await image
    .resize(LOGO_BOX, LOGO_BOX, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Writes the new object, then the row, then deletes the object the row no
 * longer points at — the avatar's order, for the avatar's reason: an orphaned
 * PNG is cheaper than reporting a failed save that did not fail.
 */
export async function storeBuyerLogo(input: {
  buyerId: string;
  actorId: string;
  bytes: Uint8Array;
}): Promise<{ url: string }> {
  const previous = await prisma.buyer.findUnique({
    where: { id: input.buyerId },
    select: { logoKey: true },
  });
  if (!previous) throw new LogoError("That buyer is gone.");

  const png = await toPng(input.bytes);
  const key = buyerLogoKey(input.buyerId, contentHash(png.bytes));
  await putObject(key, png.bytes, "image/png");

  await prisma.$transaction(async (tx) => {
    await tx.buyer.update({
      where: { id: input.buyerId },
      data: { logoKey: key, logoWidth: png.width, logoHeight: png.height },
    });
    await audit(tx, {
      action: "CUSTOMER_UPDATED",
      actorId: input.actorId,
      buyerId: input.buyerId,
      detail: { fields: ["logo"] },
    });
  });

  if (previous.logoKey && previous.logoKey !== key) {
    await deleteObject(previous.logoKey).catch((cause) =>
      console.error("[buyer-logo] could not delete the replaced object", cause),
    );
  }
  return { url: buyerLogoUrl(input.buyerId, key)! };
}

export async function removeBuyerLogo(input: {
  buyerId: string;
  actorId: string;
}): Promise<void> {
  const previous = await prisma.buyer.findUnique({
    where: { id: input.buyerId },
    select: { logoKey: true },
  });
  if (!previous) throw new LogoError("That buyer is gone.");
  if (!previous.logoKey) return;

  await prisma.$transaction(async (tx) => {
    await tx.buyer.update({
      where: { id: input.buyerId },
      data: { logoKey: null, logoWidth: null, logoHeight: null },
    });
    await audit(tx, {
      action: "CUSTOMER_UPDATED",
      actorId: input.actorId,
      buyerId: input.buyerId,
      detail: { fields: ["logo"] },
    });
  });
  await deleteObject(previous.logoKey).catch((cause) =>
    console.error("[buyer-logo] could not delete the removed object", cause),
  );
}
