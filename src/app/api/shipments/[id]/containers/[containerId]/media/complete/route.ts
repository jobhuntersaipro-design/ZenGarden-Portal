import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ContainerMediaKind } from "@/generated/prisma/enums";
import { guardRoute } from "@/lib/api-guard";
import { storeContainerThumb } from "@/lib/container-media-store";
import { prisma } from "@/lib/prisma";
import { deleteObject, getObjectPrefix, headObject } from "@/lib/r2";
import {
  CONTAINER_MEDIA_TYPES,
  CONTAINER_SIGNATURE_BYTES,
  CONTAINER_WRONG_TYPE,
  containerMediaMatches,
  containerMediaRejection,
  containerMediaType,
  isContainerMediaKey,
} from "@/lib/validation/container-files";

const bodySchema = z.object({
  key: z.string().min(1).max(300),
  name: z.string().min(1).max(200),
  type: z.string().max(200),
  size: z.number().int().positive(),
});

/** Files a photo or video once its bytes are in R2; a photo gets its thumbnail here. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; containerId: string }> },
) {
  const { user, denied } = await guardRoute("shipment.manage");
  if (denied) return denied;
  const { id: shipmentId, containerId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  const { key, name, size } = parsed.data;
  const type = containerMediaType(name, parsed.data.type);
  const reason = containerMediaRejection({ name, type: parsed.data.type, size });
  if (!type || reason) return NextResponse.json({ error: reason ?? CONTAINER_WRONG_TYPE }, { status: 400 });
  const { ext, kind } = CONTAINER_MEDIA_TYPES[type];
  if (!isContainerMediaKey(key, containerId, ext)) {
    return NextResponse.json({ error: "That upload doesn't belong to this container." }, { status: 400 });
  }
  if (!(await prisma.container.findFirst({ where: { id: containerId, shipmentId }, select: { id: true } }))) {
    return NextResponse.json({ error: "That container is gone." }, { status: 404 });
  }
  try {
    const head = await headObject(key);
    if (head.ContentLength !== size) {
      return NextResponse.json({ error: "The upload didn't arrive whole — try again." }, { status: 400 });
    }
    if (!containerMediaMatches(type, await getObjectPrefix(key, CONTAINER_SIGNATURE_BYTES))) {
      await deleteObject(key).catch(() => {});
      return NextResponse.json({ error: `${name} isn't the kind of file its name says.` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "The upload didn't arrive — try again." }, { status: 400 });
  }

  const thumbKey = kind === "PHOTO" ? await storeContainerThumb(key) : null;
  if (kind === "PHOTO" && !thumbKey) {
    await deleteObject(key).catch(() => {});
    return NextResponse.json({ error: `We couldn't read ${name} as a photo.` }, { status: 400 });
  }
  try {
    const media = await prisma.$transaction(async (tx) => {
      const row = await tx.containerMedia.create({
        data: {
          containerId,
          kind: ContainerMediaKind[kind],
          r2Key: key,
          thumbKey,
          originalName: name,
          mimeType: type,
          sizeBytes: size,
          uploadedById: user.id,
          uploadedByName: user.name,
        },
        select: { id: true },
      });
      await tx.shipmentEvent.create({
        data: {
          shipmentId,
          actorId: user.id,
          actorName: user.name,
          action: "CONTAINER_MEDIA_ADDED",
          text: `added the ${kind === "PHOTO" ? "photo" : "video"} ${name} to a container`,
        },
      });
      return row;
    });
    revalidatePath(`/shipments/${shipmentId}`);
    return NextResponse.json({ id: media.id });
  } catch (cause) {
    console.error("[containers] complete", cause);
    return NextResponse.json({ error: "We couldn't save that file." }, { status: 500 });
  }
}
