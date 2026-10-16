import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardRoute } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { presignPut } from "@/lib/r2";
import {
  SHIPMENT_WRONG_TYPE,
  shipmentDocumentKey,
  shipmentFileExt,
  shipmentFileRejection,
  shipmentFileType,
} from "@/lib/validation/shipment-files";

export type PresignedShipmentDocument = { key: string; type: string; url: string };

const bodySchema = z.object({ name: z.string().min(1).max(1000), type: z.string().max(200), size: z.number().int() });

/** One upload URL for a paper on this shipment. No row until `complete` has seen the bytes. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await guardRoute("shipment.manage");
  if (denied) return denied;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  const file = parsed.data;
  const reason = shipmentFileRejection(file);
  const type = shipmentFileType(file.name, file.type);
  if (reason || !type) return NextResponse.json({ error: reason ?? SHIPMENT_WRONG_TYPE }, { status: 400 });
  if (!(await prisma.shipment.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "That shipment is gone." }, { status: 404 });
  }
  const key = shipmentDocumentKey(id, randomUUID(), shipmentFileExt(type));
  try {
    return NextResponse.json({ key, type, url: await presignPut(key, type, file.size) } satisfies PresignedShipmentDocument);
  } catch (cause) {
    console.error("[shipments] presign failed", cause);
    return NextResponse.json({ error: "We couldn't start that upload." }, { status: 500 });
  }
}
