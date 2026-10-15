"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/actions/auth";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { listingProductIds } from "@/lib/queries/certificates";
import { deleteObject, headObject } from "@/lib/r2";
import {
  certificateSchema,
  overrideSchema,
  type CertificateInput,
} from "@/lib/validation/certificates";

const PATH = "/admin/certifications";

function revalidate() {
  revalidatePath(PATH, "layout");
  revalidatePath("/products", "layout");
  revalidatePath("/purchase-orders", "layout");
  // Shop pages read the dots live; a layout revalidate reaches every product.
  revalidatePath("/shop", "layout");
}

function failure(cause: unknown, fallback: string): { success: false; error: string } {
  if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
  console.error("[certificates]", cause);
  return { success: false, error: fallback };
}

/**
 * Create a certificate, or edit one when `id` is given. Linking a product to
 * a new certificate clears any override it carried for that type: the
 * override was standing in for a certificate, and now there is one.
 */
export async function saveCertificate(
  input: CertificateInput,
  id?: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireSuperAdmin();
    const parsed = certificateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    }
    const { type, reference, expiresOn, productIds, file } = parsed.data;
    if (!id && !file) return { success: false, error: "Upload the certificate file." };

    // What landed in R2 has to be what the form says it is.
    if (file) {
      const head = await headObject(file.key).catch(() => null);
      if (!head || head.ContentLength !== file.size || head.ContentType !== file.type) {
        return { success: false, error: "That upload didn't finish. Upload the file again." };
      }
    }

    const previous = id
      ? await prisma.certificate.findUnique({
          where: { id },
          select: { r2Key: true, products: { select: { id: true } } },
        })
      : null;
    if (id && !previous) return { success: false, error: "That certificate is gone." };

    const fileData = file
      ? { r2Key: file.key, originalName: file.name, mimeType: file.type, sizeBytes: file.size }
      : null;
    const products = { set: productIds.map((productId) => ({ id: productId })) };

    const saved = await prisma.$transaction(async (tx) => {
      const cert = id
        ? await tx.certificate.update({
            where: { id },
            data: { type, reference, expiresOn: new Date(expiresOn), products, ...fileData },
            select: { id: true },
          })
        : await tx.certificate.create({
            data: {
              type,
              reference,
              expiresOn: new Date(expiresOn),
              uploadedById: user.id,
              products: { connect: products.set },
              ...fileData!,
            },
            select: { id: true },
          });
      const before = new Set(previous?.products.map((product) => product.id));
      const added = productIds.filter((productId) => !before.has(productId));
      if (added.length) {
        await tx.certificateOverride.deleteMany({
          where: { type, productId: { in: added } },
        });
      }
      return cert;
    });

    // A replaced file is dropped from R2 after the row stops pointing at it.
    if (file && previous && previous.r2Key !== file.key) {
      await deleteObject(previous.r2Key).catch(() => {});
    }
    revalidate();
    return { success: true, data: saved };
  } catch (cause) {
    return failure(cause, "We couldn't save that certificate.");
  }
}

export async function deleteCertificate(id: string): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
    const cert = await prisma.certificate.delete({ where: { id }, select: { r2Key: true } });
    await deleteObject(cert.r2Key).catch(() => {});
    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    return failure(cause, "We couldn't delete that certificate.");
  }
}

/** Mark a product's type green — every variant of its listing — whatever its certificates say, with why. */
export async function setCertOverride(input: {
  productId: string;
  type: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const parsed = overrideSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    }
    const { productId, type, reason } = parsed.data;
    // An override covers the whole listing, so it lives on one variant: any
    // other variant's override of this type is replaced, not left beside it.
    const ids = await listingProductIds(productId);
    await prisma.$transaction([
      prisma.certificateOverride.deleteMany({ where: { productId: { in: ids }, type } }),
      prisma.certificateOverride.create({ data: { productId, type, reason, byId: user.id } }),
    ]);
    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    return failure(cause, "We couldn't save that override.");
  }
}

export async function clearCertOverride(input: {
  productId: string;
  type: string;
}): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
    const parsed = overrideSchema.pick({ productId: true, type: true }).safeParse(input);
    if (!parsed.success) return { success: false, error: "Check the form." };
    const ids = await listingProductIds(parsed.data.productId);
    await prisma.certificateOverride.deleteMany({
      where: { productId: { in: ids }, type: parsed.data.type },
    });
    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    return failure(cause, "We couldn't remove that override.");
  }
}
