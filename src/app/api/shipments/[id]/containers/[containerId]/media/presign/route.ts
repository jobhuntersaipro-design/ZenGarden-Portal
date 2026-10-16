import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardRoute } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { presignPut } from "@/lib/r2";
import {
  CONTAINER_MEDIA_TYPES,
  CONTAINER_WRONG_TYPE,
  MAX_MEDIA_PER_CONTAINER,
  containerMediaKey,
  containerMediaRejection,
  containerMediaType,
} from "@/lib/validation/container-files";

const bodySchema = z.object({ name: z.string().min(1).max(1000), type: z.string().max(200), size: z.number().int() });

/** One upload URL for a photo or video of this container. No row until `complete`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; containerId: string }> },
) {
  const { denied } = await guardRoute("shipment.manage");
  if (denied) return denied;
  const { id: shipmentId, containerId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  const reason = containerMediaRejection(parsed.data);
  const type = containerMediaType(parsed.data.name, parsed.data.type);
  if (reason || !type) return NextResponse.json({ error: reason ?? CONTAINER_WRONG_TYPE }, { status: 400 });
  const container = await prisma.container.findFirst({
    where: { id: containerId, shipmentId },
    select: { _count: { select: { media: true } } },
  });
  if (!container) return NextResponse.json({ error: "That container is gone." }, { status: 404 });
  if (container._count.media >= MAX_MEDIA_PER_CONTAINER) {
    return NextResponse.json({ error: `A container holds up to ${MAX_MEDIA_PER_CONTAINER} files.` }, { status: 400 });
  }
  const key = containerMediaKey(containerId, randomUUID(), CONTAINER_MEDIA_TYPES[type].ext);
  try {
    return NextResponse.json({ key, type, url: await presignPut(key, type, parsed.data.size) });
  } catch (cause) {
    console.error("[containers] presign failed", cause);
    return NextResponse.json({ error: "We couldn't start that upload." }, { status: 500 });
  }
}
