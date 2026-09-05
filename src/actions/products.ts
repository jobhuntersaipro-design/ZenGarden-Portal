"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2";
import { productSchema, type ProductInput } from "@/lib/validation/products";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Every action here is super-admin only, and it is checked on the server. The
 * UI hiding a button is presentation; this is the permission.
 */
const guard = async () => {
  try {
    return { user: await requireSuperAdmin(), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError
          ? cause.message
          : "You are not signed in.",
    };
  }
};

const duplicate = (cause: unknown) =>
  cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002";

function revalidate(productId?: string) {
  revalidatePath("/products");
  if (productId) revalidatePath(`/products/${productId}`);
}

export async function createProduct(
  input: ProductInput,
): Promise<ActionResult<{ id: string }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That product could not be saved.",
    };
  }
  const data = parsed.data;

  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: data.name,
          sku: data.sku,
          category: data.category,
          unit: data.unit,
          listPrice: new Prisma.Decimal(data.listPrice),
          description: data.description,
          active: data.active,
        },
        select: { id: true },
      });
      // The first price is history too; without it the trend has no origin.
      await tx.productPrice.create({
        data: {
          productId: created.id,
          price: new Prisma.Decimal(data.listPrice),
          setById: user.id,
        },
      });
      return created;
    });

    revalidate(product.id);
    return { success: true, data: { id: product.id } };
  } catch (cause) {
    if (duplicate(cause)) {
      return { success: false, error: "That SKU is already in use." };
    }
    console.error("[products] createProduct", cause);
    return { success: false, error: "We couldn't save that product." };
  }
}

export async function updateProduct(
  productId: string,
  input: ProductInput,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That product could not be saved.",
    };
  }
  const data = parsed.data;

  try {
    const existing = await prisma.product.findUnique({
      where: { id: productId },
      select: { listPrice: true },
    });
    if (!existing) return { success: false, error: "That product is gone." };

    const nextPrice = new Prisma.Decimal(data.listPrice);
    const priceChanged = !existing.listPrice.equals(nextPrice);

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          name: data.name,
          sku: data.sku,
          category: data.category,
          unit: data.unit,
          listPrice: nextPrice,
          description: data.description,
          active: data.active,
        },
      });
      // Appended only when the price actually moved: a row per save would
      // make the trend a record of edits rather than of prices.
      if (priceChanged) {
        await tx.productPrice.create({
          data: { productId, price: nextPrice, setById: user.id },
        });
      }
    });

    revalidate(productId);
    return { success: true, data: undefined };
  } catch (cause) {
    if (duplicate(cause)) {
      return { success: false, error: "That SKU is already in use." };
    }
    console.error("[products] updateProduct", cause);
    return { success: false, error: "We couldn't save that product." };
  }
}

/** Archiving keeps every line item that references the product. */
export async function archiveProduct(productId: string): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    await prisma.product.update({
      where: { id: productId },
      data: { active: false },
    });
    revalidate(productId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[products] archiveProduct", cause);
    return { success: false, error: "We couldn't archive that product." };
  }
}

export async function reorderImages(
  productId: string,
  imageIds: string[],
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    await prisma.$transaction(async (tx) => {
      // Positions are unique per product, so they cannot be rewritten in
      // place — every row moves out of the way first.
      await tx.productImage.updateMany({
        where: { productId },
        data: { position: { increment: imageIds.length + 1000 } },
      });
      for (const [index, imageId] of imageIds.entries()) {
        await tx.productImage.update({
          where: { id: imageId },
          data: { position: index },
        });
      }
    });
    revalidate(productId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[products] reorderImages", cause);
    return { success: false, error: "We couldn't reorder those images." };
  }
}

export async function deleteImage(imageId: string): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const image = await prisma.productImage.findUnique({
      where: { id: imageId },
      select: { id: true, productId: true, r2Key: true, thumbKey: true },
    });
    if (!image) return { success: false, error: "That image is gone." };

    for (const key of [image.r2Key, image.thumbKey]) {
      if (!key) continue;
      try {
        await deleteObject(key);
      } catch (cause) {
        // The row still has to go, or the gallery shows an image nobody can
        // load and nobody can remove.
        console.error(`[products] could not delete ${key}`, cause);
      }
    }

    await prisma.productImage.delete({ where: { id: imageId } });
    revalidate(image.productId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[products] deleteImage", cause);
    return { success: false, error: "We couldn't delete that image." };
  }
}
