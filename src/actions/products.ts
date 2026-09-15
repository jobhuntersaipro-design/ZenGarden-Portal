"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import {
  PENDING_KEY_PREFIX,
  copyObject,
  deleteObject,
  extensionOfKey,
  productImageKey,
  productThumbKey,
} from "@/lib/r2";
import { registerLabels } from "@/lib/catalog-label-registry";
import { productBlockedMessage } from "@/lib/product-delete-message";
import { NEEDS_AN_IMAGE } from "@/lib/validation/product-images";
import {
  productSchema,
  type ProductInput,
  type ProductParsed,
} from "@/lib/validation/products";
import {
  productVariantsSchema,
  type ProductVariantsInput,
} from "@/lib/validation/product-variants";

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

const duplicate = (cause: unknown): cause is Prisma.PrismaClientKnownRequestError =>
  cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002";

const asRecord = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

/**
 * Which unique index a P2002 hit. Two shapes, as `uniqueMessage` in
 * `client-invites.ts` records: the flat `meta.target` Prisma documents, and
 * `meta.driverAdapterError.cause.constraint.{fields,name}` that Prisma 7's
 * driver adapter actually emits. Since Phase 36 a product write can create a
 * family in the same transaction, so "already in use" has to say which code.
 */
function duplicateMessage(cause: Prisma.PrismaClientKnownRequestError): string {
  const meta = asRecord(cause.meta);
  const constraint = asRecord(asRecord(asRecord(meta?.driverAdapterError)?.cause)?.constraint);
  const text = [meta?.target, constraint?.fields, constraint?.name]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string")
    .join(",")
    .toLowerCase();
  return text.includes("code")
    ? "That family code is already in use."
    : "That SKU is already in use.";
}

function revalidate(productId?: string) {
  revalidatePath("/products");
  if (productId) revalidatePath(`/products/${productId}`);
}

/** The fields a `Product.create` shares whether it is one row or a batch of them. */
type ProductRowShared = Omit<
  ProductParsed,
  "sku" | "listPrice" | "variant" | "familyId" | "newFamily"
>;

/** The fields that are genuinely per-row: `createProduct` has exactly one. */
type ProductRowVariant = { sku: string; variant: string | null; listPrice: string };

/**
 * The thirteen-field `Product.create` payload, assembled once so
 * `createProduct` and `createProductVariants` cannot drift on which shared
 * fields a row carries — a column added to one write reaches both, whether
 * there is one row or several.
 */
function productRowData(
  shared: ProductRowShared,
  familyId: string | null,
  row: ProductRowVariant,
) {
  return {
    name: shared.name,
    sku: row.sku,
    familyId,
    category: shared.category,
    unit: shared.unit,
    brand: shared.brand,
    variant: row.variant,
    packSize: shared.packSize,
    cartonsPerPallet: shared.cartonsPerPallet,
    market: shared.market,
    listPrice: new Prisma.Decimal(row.listPrice),
    description: shared.description,
    active: shared.active,
  };
}

/**
 * One product, one submit. **Nothing in the application calls this since Phase
 * 39**: `/products/new` goes through `createProductVariants`, which with a
 * single variant row writes the same `Product`, the same first `ProductPrice`
 * and the same labels. It stays for now — a tested write path is not something
 * to remove in passing — and whether it is deleted is a decision for the end of
 * the phase.
 */
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
      // A family described on the form is created first, in the same
      // transaction, so a product cannot land without the family it named.
      const familyId = data.newFamily
        ? (await tx.productFamily.create({ data: data.newFamily, select: { id: true } })).id
        : data.familyId;
      const created = await tx.product.create({
        data: productRowData(data, familyId, data),
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
      return { success: false, error: duplicateMessage(cause) };
    }
    console.error("[products] createProduct", cause);
    return { success: false, error: "We couldn't save that product." };
  }
}

/**
 * A product and every flavour of it, in one submit and one transaction
 * (Phase 39).
 *
 * Not a loop over `createProduct`: eight separate calls means eight
 * transactions, so a duplicate SKU on the seventh leaves six products and a
 * family behind — a half-entered catalogue nobody asked for and nobody can see
 * is half-entered. Here the family is created once and every row, its first
 * price and its labels commit together or not at all.
 *
 * The ids come back in submitted row order, because the caller has staged
 * images per row and nothing else could tell it which product owns which.
 */
export async function createProductVariants(
  input: ProductVariantsInput,
): Promise<
  ActionResult<{ familyId: string | null; variants: { id: string; sku: string }[] }>
> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = productVariantsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those variants could not be saved.",
    };
  }
  const data = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const familyId = data.newFamily
        ? (await tx.productFamily.create({ data: data.newFamily, select: { id: true } })).id
        : data.familyId;

      const variants: { id: string; sku: string }[] = [];
      for (const row of data.variants) {
        const created = await tx.product.create({
          data: productRowData(data, familyId, row),
          select: { id: true, sku: true },
        });
        // The first price is history too, exactly as in `createProduct`:
        // without it a variant's trend has no origin.
        await tx.productPrice.create({
          data: {
            productId: created.id,
            price: new Prisma.Decimal(row.listPrice),
            setById: user.id,
          },
        });
        await registerLabels(tx, {
          brand: data.brand,
          variant: row.variant,
          market: data.market,
          category: data.category,
        });
        variants.push(created);
      }

      return { familyId: familyId ?? null, variants };
    });

    revalidate();
    return { success: true, data: result };
  } catch (cause) {
    if (duplicate(cause)) {
      return { success: false, error: duplicateMessage(cause) };
    }
    console.error("[products] createProductVariants", cause);
    return { success: false, error: "We couldn't save those variants." };
  }
}

/**
 * How many copy units (one image copied to one target) run at once.
 *
 * Bounded rather than unbounded (`Promise.all` over everything) for two
 * reasons that both bite in production and never show up on a laptop against
 * a handful of test rows: R2 rate-limits a bucket's concurrent requests, and
 * Prisma's connection pool has a fixed size shared with every other request
 * this deployment is serving at the same moment. Fully sequential measured at
 * ~463 ms a unit — 8 variants × 4 images is already ~13 s, past a serverless
 * function's default ceiling (Phase 39 browser pass, task-7-report.md §4). 6
 * is comfortably under both limits while still cutting that wall time by
 * roughly the same factor.
 */
// Not exported: a "use server" file may only export async functions, so the
// value the concurrency test pins is the observed behaviour (six units in
// flight), not this symbol.
const COPY_CONCURRENCY = 6;

/**
 * Runs `worker` over `items` with at most `concurrency` in flight, in order —
 * a fixed pool of workers each pulling the next unclaimed index, rather than
 * `items.length` promises started all at once.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/** One image, headed to one target — the unit of work `copyImagesToVariants`
 * parallelises. `position` is fixed before any unit runs (see below), so two
 * units for the same target can never collide on it. */
type CopyUnit = {
  targetId: string;
  image: { r2Key: string; thumbKey: string | null; sizeBytes: number };
  position: number;
};

/**
 * Gives a set of variants the photographs of one of their siblings
 * (Phase 39).
 *
 * Phase 27's rule is that a product cannot exist without a picture, and a set
 * of eight flavours usually has one photograph of the range rather than eight.
 * The bytes are uploaded once, through the ordinary presign → PUT → complete
 * route — which is what runs sharp and writes the 1600px derivative — and this
 * copies both objects of every processed image to each sibling's own key.
 *
 * Deliberately not transactional. A copy is an R2 call, not a database write,
 * and a failed one must not roll back the images that did land: a variant with
 * one of two photographs is a product somebody can fix from
 * `ProductImageManager`, while a rollback would leave it with none and no
 * record of what was attempted. What each failure *does* undo is its own row
 * and any object it already wrote to R2 — a failed image leaves neither a row
 * nor an orphaned object behind, because a `ProductImage` whose `r2Key` is
 * still the placeholder renders a tile nobody can load and nobody can remove,
 * and an object nothing points at is a silent, permanent leak in the bucket.
 *
 * The copy units — one image × one target — run with bounded concurrency
 * (`COPY_CONCURRENCY`) rather than one at a time. Positions still have to be
 * deterministic under that: each target's existing image count is read
 * *before any of its units are built*, so every unit already knows its final
 * `position` and no two units racing on the same target can compute the same
 * one. `ProductImage`'s `@@unique([productId, position])` is what would catch
 * it if they did. The two R2 calls within one image — original, then
 * derivative — stay sequential, because a unit's own orphan cleanup depends on
 * knowing which of the two actually landed; only the units run in parallel.
 */
export async function copyImagesToVariants(
  sourceProductId: string,
  targetProductIds: string[],
): Promise<ActionResult<{ copied: number; failed: number }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };
  if (targetProductIds.length === 0) {
    return { success: true, data: { copied: 0, failed: 0 } };
  }

  try {
    // `thumbKey: { not: null }` is what "processed" means: a row whose upload
    // never completed has no derivative, and copying its original alone would
    // give the sibling a tile every screen reads through the derivative.
    const images = await prisma.productImage.findMany({
      where: { productId: sourceProductId, thumbKey: { not: null } },
      orderBy: { position: "asc" },
      select: { r2Key: true, thumbKey: true, sizeBytes: true, position: true },
    });
    if (images.length === 0) {
      return {
        success: false,
        error: "That product has no processed images to copy.",
      };
    }

    // Offset past anything each target already carries, read once per target
    // before any unit exists — not lazily inside a unit, where two units for
    // the same target running at once would both read the same count and
    // propose the same position.
    const taken = await Promise.all(
      targetProductIds.map((targetId) =>
        prisma.productImage.count({ where: { productId: targetId } }),
      ),
    );
    const units: CopyUnit[] = targetProductIds.flatMap((targetId, targetIndex) =>
      images.map((image, index) => ({
        targetId,
        image,
        position: taken[targetIndex] + index,
      })),
    );

    let copied = 0;
    let failed = 0;

    await runWithConcurrency(units, COPY_CONCURRENCY, async (unit) => {
      let rowId: string | null = null;
      // Keys that have actually landed in R2 for this image, so a failure
      // partway through (the original copied but the derivative didn't, or
      // the update itself throws) can undo the object as well as the row —
      // otherwise the first copy is an orphan nothing ever cleans up.
      const written: string[] = [];
      try {
        const row = await prisma.productImage.create({
          data: {
            productId: unit.targetId,
            r2Key: `${PENDING_KEY_PREFIX}${randomUUID()}`,
            position: unit.position,
            sizeBytes: unit.image.sizeBytes,
          },
          select: { id: true },
        });
        rowId = row.id;

        const r2Key = productImageKey(
          unit.targetId,
          row.id,
          extensionOfKey(unit.image.r2Key),
        );
        const thumbKey = productThumbKey(unit.targetId, row.id);
        await copyObject(unit.image.r2Key, r2Key);
        written.push(r2Key);
        await copyObject(unit.image.thumbKey!, thumbKey);
        written.push(thumbKey);
        await prisma.productImage.update({
          where: { id: row.id },
          data: { r2Key, thumbKey },
        });
        copied += 1;
      } catch (cause) {
        console.error("[products] copyImagesToVariants", cause);
        failed += 1;
        for (const key of written) {
          await deleteObject(key).catch(() => undefined);
        }
        if (rowId) {
          await prisma.productImage
            .delete({ where: { id: rowId } })
            .catch(() => undefined);
        }
      }
    });

    revalidate();
    return { success: true, data: { copied, failed } };
  } catch (cause) {
    console.error("[products] copyImagesToVariants", cause);
    return { success: false, error: "We couldn't copy those images." };
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
      const familyId = data.newFamily
        ? (await tx.productFamily.create({ data: data.newFamily, select: { id: true } })).id
        : data.familyId;
      await tx.product.update({
        where: { id: productId },
        data: {
          name: data.name,
          sku: data.sku,
          familyId,
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
      return { success: false, error: duplicateMessage(cause) };
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
