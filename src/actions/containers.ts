"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/actions/purchase-orders";
import { UnauthorizedError, type SessionUser } from "@/lib/auth-guards";
import { requirePermission } from "@/lib/permissions/require";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2";

async function guard(): Promise<{ user: SessionUser; error: null } | { user: null; error: string }> {
  try {
    return { user: await requirePermission("shipment.manage"), error: null };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { user: null, error: cause.message };
    throw cause;
  }
}

const id = z.string().min(1).max(64);
const field = (max: number) =>
  z.string().trim().max(max).transform((v) => v || null).nullable().optional();

const fieldsSchema = z.object({
  containerNo: field(40),
  sealNo: field(40),
  size: field(20),
  description: field(2000),
});

/** Revalidates the shipment and every buyer page that shows its containers. */
async function touch(shipmentId: string) {
  revalidatePath(`/shipments/${shipmentId}`);
  revalidatePath("/shop/orders/[id]", "page");
}

const event = (shipmentId: string, user: SessionUser, action: string, text: string) =>
  prisma.shipmentEvent.create({ data: { shipmentId, actorId: user.id, actorName: user.name, action, text } });

export async function createContainer(input: { shipmentId: string } & z.input<typeof fieldsSchema>): Promise<ActionResult<{ id: string }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error };
  const parsed = fieldsSchema.extend({ shipmentId: id }).safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { shipmentId, ...data } = parsed.data;
  try {
    const row = await prisma.container.create({
      data: { shipmentId, ...data, createdById: user.id },
      select: { id: true },
    });
    await event(shipmentId, user, "CONTAINER_ADDED", `added container ${data.containerNo ?? "(no number yet)"}`);
    await touch(shipmentId);
    return { success: true, data: row };
  } catch (cause) {
    console.error("[containers] create", cause);
    return { success: false, error: "We couldn't add that container." };
  }
}

/** Every edit records who made it: the screen reads "Last edited by". */
export async function updateContainer(input: { id: string } & z.input<typeof fieldsSchema>): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error };
  const parsed = fieldsSchema.extend({ id }).safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { id: containerId, ...data } = parsed.data;
  try {
    const row = await prisma.container.update({
      where: { id: containerId },
      data: { ...data, updatedById: user.id },
      select: { shipmentId: true, containerNo: true },
    });
    await event(row.shipmentId, user, "CONTAINER_UPDATED", `edited container ${row.containerNo ?? ""}`.trim());
    await touch(row.shipmentId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[containers] update", cause);
    return { success: false, error: "We couldn't save that container." };
  }
}

/** Rows first, then the objects: a failed object delete leaves an orphan, never a dead tile. */
export async function deleteContainer(input: { id: string }): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error };
  const parsed = id.safeParse(input.id);
  if (!parsed.success) return { success: false, error: "That container is gone." };
  try {
    const row = await prisma.container.findUnique({
      where: { id: parsed.data },
      select: { shipmentId: true, containerNo: true, media: { select: { r2Key: true, thumbKey: true } } },
    });
    if (!row) return { success: false, error: "That container is gone." };
    await prisma.container.delete({ where: { id: parsed.data } });
    await event(row.shipmentId, user, "CONTAINER_DELETED", `deleted container ${row.containerNo ?? ""}`.trim());
    for (const key of row.media.flatMap((m) => [m.r2Key, m.thumbKey]).filter((k): k is string => Boolean(k))) {
      await deleteObject(key).catch((cause) => console.error("[containers] could not delete", key, cause));
    }
    await touch(row.shipmentId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[containers] delete", cause);
    return { success: false, error: "We couldn't delete that container." };
  }
}

export async function deleteContainerMedia(input: { id: string }): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error };
  const parsed = id.safeParse(input.id);
  if (!parsed.success) return { success: false, error: "That file is gone." };
  try {
    const media = await prisma.containerMedia.findUnique({
      where: { id: parsed.data },
      select: { r2Key: true, thumbKey: true, originalName: true, container: { select: { shipmentId: true } } },
    });
    if (!media) return { success: false, error: "That file is gone." };
    await prisma.containerMedia.delete({ where: { id: parsed.data } });
    await event(media.container.shipmentId, user, "CONTAINER_MEDIA_DELETED", `deleted ${media.originalName} from a container`);
    for (const key of [media.r2Key, media.thumbKey]) {
      if (key) await deleteObject(key).catch((cause) => console.error("[containers] could not delete", key, cause));
    }
    await touch(media.container.shipmentId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[containers] delete media", cause);
    return { success: false, error: "We couldn't delete that file." };
  }
}

/** A staff note on one photo or video; blank clears it. Buyers never see it. */
export async function setContainerMediaNote(input: { id: string; note: string }): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error };
  const parsed = z
    .object({ id, note: z.string().trim().max(2000, "Keep a note under 2,000 characters.") })
    .safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "That file is gone." };
  try {
    const media = await prisma.containerMedia.findUnique({
      where: { id: parsed.data.id },
      select: { originalName: true, container: { select: { shipmentId: true } } },
    });
    if (!media) return { success: false, error: "That file is gone." };
    const note = parsed.data.note || null;
    await prisma.containerMedia.update({ where: { id: parsed.data.id }, data: { note } });
    await event(
      media.container.shipmentId,
      user,
      "CONTAINER_MEDIA_NOTE",
      note ? `noted ${media.originalName}: ${note}` : `removed the note on ${media.originalName}`,
    );
    await touch(media.container.shipmentId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[containers] media note", cause);
    return { success: false, error: "We couldn't save that note." };
  }
}
