import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { PENDING_KEY_PREFIX, presignPut, productImageKey } from "@/lib/r2";
import {
  MAX_IMAGES_PER_CALL,
  TOO_MANY_IMAGES,
  type ProductImageMimeType,
  extensionFor,
  imagePresignRequestSchema,
  rejectionReason,
} from "@/lib/validation/product-images";

export type PresignedImage = {
  name: string;
  imageId: string;
  key: string;
  url: string;
  position: number;
};

export type PresignImageError = { name: string; reason: string };

export type PresignImageResponse = {
  files: PresignedImage[];
  errors: PresignImageError[];
};

/**
 * The whole batch in one call, and this is not a stylistic echo of Phase 03.
 * `ProductImage` has `@@unique([productId, position])` and the upload hook runs
 * three files at once, so presigning per file races on `position` and throws
 * P2002. Allocating positions serially inside a single call removes the race
 * by construction rather than by retry.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json({ error: cause.message }, { status: 401 });
    }
    throw cause;
  }

  const { id: productId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { files?: unknown }).files) &&
    (body as { files: unknown[] }).files.length > MAX_IMAGES_PER_CALL
  ) {
    return NextResponse.json({ error: TOO_MANY_IMAGES }, { status: 400 });
  }

  const parsed = imagePresignRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    return NextResponse.json({ error: "That product is gone." }, { status: 404 });
  }

  let taken = await prisma.productImage.count({ where: { productId } });

  const files: PresignedImage[] = [];
  const errors: PresignImageError[] = [];

  for (const file of parsed.data.files) {
    const reason = rejectionReason(file, taken);
    if (reason) {
      errors.push({ name: file.name, reason });
      continue;
    }

    const mimeType = file.type as ProductImageMimeType;
    try {
      // The row is created first so the key can carry the image's own id.
      // r2Key is unique and needs a value before that id exists, so the
      // placeholder has to be unique too — the Phase 03 trick.
      const image = await prisma.productImage.create({
        data: {
          productId,
          r2Key: `${PENDING_KEY_PREFIX}${randomUUID()}`,
          position: taken,
          sizeBytes: file.size,
        },
        select: { id: true, position: true },
      });
      const key = productImageKey(productId, image.id, extensionFor(mimeType));
      await prisma.productImage.update({
        where: { id: image.id },
        data: { r2Key: key },
      });

      files.push({
        name: file.name,
        imageId: image.id,
        key,
        url: await presignPut(key, mimeType, file.size),
        position: image.position,
      });
      taken += 1;
    } catch (cause) {
      console.error("[product-images] presign failed", cause);
      errors.push({ name: file.name, reason: "We couldn't start that upload" });
    }
  }

  return NextResponse.json({ files, errors } satisfies PresignImageResponse);
}
