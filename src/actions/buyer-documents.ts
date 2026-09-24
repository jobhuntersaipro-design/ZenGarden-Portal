"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UnauthorizedError } from "@/lib/auth-guards";
import { requirePermission } from "@/lib/permissions/require";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2";
import { listDocumentFolders } from "@/lib/queries/buyer-documents";
import { canonicalFolder, folderSchema } from "@/lib/validation/buyer-files";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const idSchema = z.string().min(1).max(64);

async function manage() {
  try {
    return { error: null, user: await requirePermission("buyer.manage") };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { error: cause.message, user: null };
    throw cause;
  }
}

const revalidate = (buyerId: string) => {
  revalidatePath(`/buyers/${buyerId}`);
  revalidatePath(`/admin/buyers/${buyerId}`);
};

/** Removes the row, then the object — a leftover object is the cheaper failure. */
export async function deleteBuyerDocument(input: { id: string }): Promise<ActionResult> {
  const { error } = await manage();
  if (error) return { success: false, error };
  const id = idSchema.safeParse(input.id);
  if (!id.success) return { success: false, error: "That file is gone." };

  try {
    const document = await prisma.buyerDocument.findUnique({
      where: { id: id.data },
      select: { buyerId: true, r2Key: true },
    });
    if (!document) return { success: false, error: "That file is gone." };
    await prisma.buyerDocument.delete({ where: { id: id.data } });
    await deleteObject(document.r2Key).catch((cause) =>
      console.error("[buyer-documents] could not delete the object", cause),
    );
    revalidate(document.buyerId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[buyer-documents] delete", cause);
    return { success: false, error: "We couldn't delete that file." };
  }
}

/** Files a document under another folder — the fix for one filed in the wrong place. */
export async function moveBuyerDocument(input: {
  id: string;
  folder: string;
}): Promise<ActionResult<{ folder: string }>> {
  const { error } = await manage();
  if (error) return { success: false, error };
  const id = idSchema.safeParse(input.id);
  const folder = folderSchema.safeParse(input.folder);
  if (!id.success) return { success: false, error: "That file is gone." };
  if (!folder.success) {
    return { success: false, error: folder.error.issues[0]?.message ?? "Choose a folder." };
  }

  try {
    const name = canonicalFolder(folder.data, await listDocumentFolders());
    const document = await prisma.buyerDocument.update({
      where: { id: id.data },
      data: { folder: name },
      select: { buyerId: true },
    });
    revalidate(document.buyerId);
    return { success: true, data: { folder: name } };
  } catch (cause) {
    console.error("[buyer-documents] move", cause);
    return { success: false, error: "We couldn't move that file." };
  }
}
