"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { UnauthorizedError } from "@/lib/auth-guards";
import { requirePermission } from "@/lib/permissions/require";
import { prisma } from "@/lib/prisma";
import {
  productFamilySchema,
  type ProductFamilyInput,
} from "@/lib/validation/product-families";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * A family's own facts — its code, name and size — kept from the admin
 * room's Families section (Phase 36 §4). Super admin only, checked here: the
 * room being 404'd for everyone else is the outer door, this is the lock.
 *
 * A family's *membership* can also be edited here (Phase 40): a product
 * joins or leaves a family from its own form and drawer, from the propose →
 * apply script that places the imported ones, and now from the listing's own
 * page too — the only place the whole set is visible at once.
 */
const guard = async () => {
  try {
    return { user: await requirePermission("product.manage"), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }
};

const duplicate = (cause: unknown) =>
  cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002";

const missing = (cause: unknown) =>
  cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2025";

const TAKEN = (code: string) => `There is already a family coded “${code}”.`;

function revalidate() {
  revalidatePath("/admin/catalogue");
  revalidatePath("/products");
}

/** Rename, re-code or re-size. Products are untouched: they link by id. */
export async function updateFamily(
  id: string,
  input: Pick<ProductFamilyInput, "code" | "name" | "size">,
): Promise<ActionResult<{ code: string; name: string; size: string | null }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = productFamilySchema
    .pick({ code: true, name: true, size: true })
    .safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That family could not be saved.",
    };
  }
  const data = parsed.data;

  try {
    const family = await prisma.productFamily.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!family) return { success: false, error: "That family is gone." };

    await prisma.productFamily.update({ where: { id }, data });
    revalidate();
    return { success: true, data };
  } catch (cause) {
    if (duplicate(cause)) return { success: false, error: TAKEN(data.code) };
    console.error("[product-families] updateFamily", cause);
    return { success: false, error: "We couldn't save that family." };
  }
}

/** Refused while any product is in it: the products would lose their family. */
export async function removeFamily(id: string): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const family = await prisma.productFamily.findUnique({
      where: { id },
      select: { code: true, _count: { select: { products: true } } },
    });
    if (!family) return { success: false, error: "That family is gone." };
    if (family._count.products > 0) {
      const n = family._count.products;
      return {
        success: false,
        error: `${n} ${n === 1 ? "product is" : "products are"} in ${family.code}, so it can't be removed. Move them first.`,
      };
    }

    await prisma.productFamily.delete({ where: { id } });
    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[product-families] removeFamily", cause);
    return { success: false, error: "We couldn't remove that family." };
  }
}

/**
 * Membership, from the listing's own page (Phase 40).
 *
 * Phase 36 put this decision on the product's form on purpose: "which family
 * is this product in" was a judgement made while looking at the product. It
 * is now also a judgement made while looking at the *listing*, which is the
 * only place the whole set is visible, so both ends can make it.
 *
 * Neither of these deletes anything. A product removed from a family keeps
 * every column it had and returns to the grouping the shop derives from its
 * brand, name and market.
 */
export async function addProductToFamily(
  productId: string,
  familyId: string,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    await prisma.product.update({
      where: { id: productId },
      data: { familyId },
    });
    revalidate();
    revalidatePath(`/admin/catalogue/families/${familyId}`);
    return { success: true, data: undefined };
  } catch (cause) {
    if (missing(cause)) return { success: false, error: "That product is gone." };
    console.error("[families] addProductToFamily", cause);
    return { success: false, error: "We couldn't add that product." };
  }
}

export async function removeProductFromFamily(productId: string): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    await prisma.product.update({
      where: { id: productId },
      data: { familyId: null },
    });
    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    if (missing(cause)) return { success: false, error: "That product is gone." };
    console.error("[families] removeProductFromFamily", cause);
    return { success: false, error: "We couldn't remove that product." };
  }
}
