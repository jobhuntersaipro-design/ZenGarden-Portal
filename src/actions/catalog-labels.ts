"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { CatalogLabelKind } from "@/generated/prisma/enums";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import {
  LABEL_FIELD,
  LABEL_NOUN,
  PROTECTED_MESSAGE,
  inUseMessage,
  isProtectedLabel,
} from "@/lib/catalog-labels";
import { prisma } from "@/lib/prisma";
import {
  createLabelSchema,
  renameLabelSchema,
  type CreateLabelInput,
  type RenameLabelInput,
} from "@/lib/validation/catalog-labels";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * The catalogue's vocabulary: the values brand, variant, market and category
 * are chosen from. Super admin only, checked on the server — the admin room
 * being 404'd for everyone else is the outer door, this is the lock.
 *
 * Every write here can touch hundreds of products at once (a rename does, by
 * design), which is why renaming and removing both re-read the row and
 * re-count its usage inside the action rather than trusting what the screen
 * was showing when the button was drawn.
 */
const guard = async () => {
  try {
    return { user: await requireSuperAdmin(), error: null as string | null };
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

const taken = (kind: CatalogLabelKind, value: string) =>
  `There is already a ${LABEL_NOUN[kind].one} called “${value}”.`;

function revalidate() {
  revalidatePath("/admin/catalogue");
  revalidatePath("/products");
}

/** A value that exists before any product carries it — the point of the table. */
export async function createLabel(
  input: CreateLabelInput,
): Promise<ActionResult<{ id: string }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = createLabelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That value could not be saved.",
    };
  }
  const { kind, value } = parsed.data;

  try {
    // Case-insensitive: the unique index is not, and a list holding "Mydin"
    // beside "MYDIN" is the fragmentation these pickers exist to avoid.
    const clash = await prisma.catalogLabel.findFirst({
      where: { kind, value: { equals: value, mode: "insensitive" } },
      select: { value: true },
    });
    if (clash) return { success: false, error: taken(kind, clash.value) };

    const label = await prisma.catalogLabel.create({
      data: { kind, value },
      select: { id: true },
    });
    revalidate();
    return { success: true, data: { id: label.id } };
  } catch (cause) {
    if (duplicate(cause)) return { success: false, error: taken(kind, value) };
    console.error("[catalog-labels] createLabel", cause);
    return { success: false, error: "We couldn't save that value." };
  }
}

/**
 * Rename the value and every product carrying it, in one transaction. A
 * rename that updated the vocabulary alone would leave the products pointing
 * at a value the picker no longer offers — the fragmentation this is meant to
 * repair, caused by the repair.
 */
export async function renameLabel(
  input: RenameLabelInput,
): Promise<ActionResult<{ products: number; value: string }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = renameLabelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That value could not be saved.",
    };
  }
  const { id, value } = parsed.data;
  // Held outside the try so the duplicate handler can name the right noun.
  let kind: CatalogLabelKind | null = null;

  try {
    const label = await prisma.catalogLabel.findUnique({ where: { id } });
    if (!label) return { success: false, error: "That value is gone." };
    kind = label.kind;

    if (isProtectedLabel(label.kind, label.value)) {
      return { success: false, error: PROTECTED_MESSAGE(label.value) };
    }
    if (label.value === value) return { success: true, data: { products: 0, value } };

    const clash = await prisma.catalogLabel.findFirst({
      where: {
        kind: label.kind,
        value: { equals: value, mode: "insensitive" },
        id: { not: label.id },
      },
      select: { value: true },
    });
    if (clash) return { success: false, error: taken(label.kind, clash.value) };

    const field = LABEL_FIELD[label.kind];
    const products = await prisma.$transaction(async (tx) => {
      await tx.catalogLabel.update({ where: { id: label.id }, data: { value } });
      const moved = await tx.product.updateMany({
        // Insensitively, for the same reason the counts are: a product written
        // by an import can differ in case from the vocabulary's own spelling,
        // and leaving it behind would strand it under a value nothing offers.
        where: { [field]: { equals: label.value, mode: "insensitive" } },
        data: { [field]: value },
      });
      return moved.count;
    });

    revalidate();
    return { success: true, data: { products, value } };
  } catch (cause) {
    if (duplicate(cause) && kind) {
      return { success: false, error: taken(kind, value) };
    }
    console.error("[catalog-labels] renameLabel", cause);
    return { success: false, error: "We couldn't rename that value." };
  }
}

/** Refused while any product carries it: removing it would blank that field. */
export async function removeLabel(id: string): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const label = await prisma.catalogLabel.findUnique({ where: { id } });
    if (!label) return { success: false, error: "That value is gone." };

    if (isProtectedLabel(label.kind, label.value)) {
      return { success: false, error: PROTECTED_MESSAGE(label.value) };
    }

    const products = await prisma.product.count({
      where: { [LABEL_FIELD[label.kind]]: { equals: label.value, mode: "insensitive" } },
    });
    if (products > 0) {
      return { success: false, error: inUseMessage(label.value, products) };
    }

    await prisma.catalogLabel.delete({ where: { id: label.id } });
    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[catalog-labels] removeLabel", cause);
    return { success: false, error: "We couldn't remove that value." };
  }
}
