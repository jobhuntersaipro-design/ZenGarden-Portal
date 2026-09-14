"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2";
import { registerLabels } from "@/lib/catalog-label-registry";
import { productBlockedMessage } from "@/lib/product-delete-message";
import { NEEDS_AN_IMAGE } from "@/lib/validation/product-images";
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
          brand: data.brand,
          variant: data.variant,
          packSize: data.packSize,
          cartonsPerPallet: data.cartonsPerPallet,
          market: data.market,
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
      // Anything typed into a picker joins the vocabulary, inside the same
      // transaction — so a value cannot outlive its product only by accident,
      // nor vanish with it.
      await registerLabels(tx, {
        brand: data.brand,
        variant: data.variant,
        market: data.market,
        category: data.category,
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
      select: { listPrice: true, _count: { select: { images: true } } },
    });
    if (!existing) return { success: false, error: "That product is gone." };

    // Phase 27: a product carries at least one picture. This is the
    // enforcement — `ProductSheet`'s disabled button is presentation, and the
    // create form cannot be checked here at all, since its row has to exist
    // before an image can reference it. Archiving is deliberately *not*
    // gated: archiving is a reasonable answer to a product nobody has a
    // photograph of, and the catalogue's ~308 imported rows have none.
    if (existing._count.images === 0) {
      return { success: false, error: NEEDS_AN_IMAGE };
    }

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
          brand: data.brand,
          variant: data.variant,
          packSize: data.packSize,
          cartonsPerPallet: data.cartonsPerPallet,
          market: data.market,
          listPrice: nextPrice,
          description: data.description,
          active: data.active,
          // Saving is the review. A product created from a purchase order
          // carried guessed values; a person has now looked at them.
          needsReview: false,
        },
      });
      // Appended only when the price actually moved: a row per save would
      // make the trend a record of edits rather than of prices.
      if (priceChanged) {
        await tx.productPrice.create({
          data: { productId, price: nextPrice, setById: user.id },
        });
      }
      await registerLabels(tx, {
        brand: data.brand,
        variant: data.variant,
        market: data.market,
        category: data.category,
      });
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

/**
 * Publish or unpublish, which is what `Product.active` has always meant: the
 * shop lists a product only when it is active, carries a price and is not
 * awaiting review (`shop-catalogue.ts`). Phase 28 gave the flag the word a
 * reader would use for it and took the control out of the edit drawer.
 *
 * Deliberately not gated on having an image, unlike saving edits: unpublishing
 * is a reasonable thing to do *about* a product with no picture, and the
 * imported catalogue is full of them. Every line item that references the
 * product is untouched either way — this is visibility, not deletion.
 */
export async function setProductPublished(
  productId: string,
  published: boolean,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    await prisma.product.update({
      where: { id: productId },
      data: { active: published },
    });
    revalidate(productId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[products] setProductPublished", cause);
    return {
      success: false,
      error: published
        ? "We couldn't publish that product."
        : "We couldn't unpublish that product.",
    };
  }
}

/**
 * Delete a product outright — the row, its price history, its images and the
 * objects those images hold in R2.
 *
 * Refused while anything references it. A purchase-order line's `productId` is
 * nullable and would be set null by a delete, silently detaching a confirmed
 * order's line from the thing it was for; a shop-order line's is not nullable
 * at all and the delete would simply fail. Both are the same answer to the
 * reader: unpublish it instead.
 *
 * The name is re-checked here rather than only in the dialog, and the
 * references re-counted: the dialog is what the screen was showing when the
 * button was drawn, not what is true now.
 */
export async function deleteProduct(
  productId: string,
  confirmName: string,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        images: { select: { r2Key: true, thumbKey: true } },
        _count: { select: { lineItems: true, webOrderLines: true } },
      },
    });
    if (!product) return { success: false, error: "That product is gone." };

    if (product.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) {
      return {
        success: false,
        error: "That name doesn't match. Type the product's name exactly to delete it.",
      };
    }

    const { lineItems, webOrderLines } = product._count;
    if (lineItems > 0 || webOrderLines > 0) {
      return { success: false, error: productBlockedMessage(lineItems, webOrderLines) };
    }

    // The row first: if R2 fails afterwards the catalogue is still correct and
    // the orphans cost storage, where deleting the objects first and failing
    // on the row would leave tiles nobody can load and nobody can remove.
    // `ProductImage` and `ProductPrice` both cascade from the product.
    await prisma.product.delete({ where: { id: product.id } });

    for (const image of product.images) {
      for (const key of [image.r2Key, image.thumbKey]) {
        if (!key) continue;
        try {
          await deleteObject(key);
        } catch (cause) {
          // Reported, never thrown: the product is already gone, and telling
          // the reader the delete failed would be false.
          console.error("[products] deleteProduct orphaned object", key, cause);
        }
      }
    }

    revalidate(product.id);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[products] deleteProduct", cause);
    return { success: false, error: "We couldn't delete that product." };
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
