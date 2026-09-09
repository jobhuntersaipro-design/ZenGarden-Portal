import { NextResponse } from "next/server";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { ProductImageError, storeProductImage } from "@/lib/product-image-store";
import { deleteObject, headObject } from "@/lib/r2";
import { imageCompleteRequestSchema } from "@/lib/validation/product-images";

export type CompleteImageResponse = {
  imageId: string;
  position: number;
};

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
  const parsed = imageCompleteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const image = await prisma.productImage.findUnique({
    where: { id: parsed.data.imageId },
    select: {
      id: true,
      productId: true,
      r2Key: true,
      thumbKey: true,
      sizeBytes: true,
      position: true,
    },
  });
  if (!image || image.productId !== productId) {
    return NextResponse.json({ error: "That image is gone." }, { status: 404 });
  }
  // Already processed: the client retried, which must not redo the work.
  if (image.thumbKey) {
    return NextResponse.json({
      imageId: image.id,
      position: image.position,
    } satisfies CompleteImageResponse);
  }

  // A presigned URL proves what the client *declared*, not what it sent, so
  // the object is measured before any work is done on it.
  try {
    const head = await headObject(image.r2Key);
    if (head.ContentLength !== image.sizeBytes) throw new Error("size mismatch");
  } catch (cause) {
    console.error("[product-images] complete verification failed", cause);
    // A half-made image is worse than none: the gallery would render a tile
    // nobody can load and nobody can remove.
    try {
      await deleteObject(image.r2Key);
    } catch {
      // Nothing to delete is the expected case here.
    }
    await prisma.productImage.delete({ where: { id: image.id } });
    return NextResponse.json(
      { error: "Upload did not complete" },
      { status: 400 },
    );
  }

  try {
    await storeProductImage({
      imageId: image.id,
      productId: image.productId,
      r2Key: image.r2Key,
    });
  } catch (cause) {
    console.error("[product-images] processing failed", cause);
    try {
      await deleteObject(image.r2Key);
    } catch {
      // As above.
    }
    await prisma.productImage.delete({ where: { id: image.id } });
    return NextResponse.json(
      {
        error:
          cause instanceof ProductImageError
            ? cause.message
            : "We couldn't process that image.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    imageId: image.id,
    position: image.position,
  } satisfies CompleteImageResponse);
}
