import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardRoute } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { deleteObject, getObjectPrefix, headObject } from "@/lib/r2";
import { CUSTOMS_LABELS, docPhrase } from "@/lib/shipments/checklist";
import {
  MAX_PO_DOCUMENT_BYTES,
  PO_DOCUMENT_SIGNATURE_BYTES,
  poDocumentContentsReason,
} from "@/lib/validation/po-files";
import { MAX_DOCUMENT_NAME_LENGTH } from "@/lib/validation/buyer-files";
import {
  SHIPMENT_WRONG_TYPE,
  docTypeSchema,
  isShipmentDocumentKey,
  shipmentFileExt,
  shipmentFileRejection,
  shipmentFileType,
} from "@/lib/validation/shipment-files";

const bodySchema = z.object({
  key: z.string().min(1).max(300),
  name: z.string().min(1).max(MAX_DOCUMENT_NAME_LENGTH),
  type: z.string().max(200),
  size: z.number().int().positive().max(MAX_PO_DOCUMENT_BYTES),
  docType: docTypeSchema,
  label: z.string().trim().max(80).nullable().optional(),
  /** "Other" papers only: the current row this file replaces. */
  replaces: z.string().min(1).max(40).optional(),
});

class NameTaken extends Error {}

const CONTENTS = "That file isn't a PDF, JPG or PNG — the contents don't match the type";

/**
 * Files a paper once its bytes are in R2, into its slot. A slot that already
 * holds a file keeps it as an earlier version: the old row is superseded and
 * the new one created in one transaction, so a slot never has two current files.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await guardRoute("shipment.manage");
  if (denied) return denied;
  const { id: shipmentId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Malformed request." }, { status: 400 });
  }
  const { key, name, size, docType, replaces } = parsed.data;
  const other = docType === "OTHER";
  const label = other ? parsed.data.label?.trim() || null : docType === "CUSTOMS_FORM" ? parsed.data.label || null : null;
  if (other && !label) return NextResponse.json({ error: "Give the document a name." }, { status: 400 });
  if (docType === "CUSTOMS_FORM" && label && !(CUSTOMS_LABELS as readonly string[]).includes(label)) {
    return NextResponse.json({ error: "Choose K1 to K5." }, { status: 400 });
  }
  const type = shipmentFileType(name, parsed.data.type);
  const reason = shipmentFileRejection({ name, type: parsed.data.type, size });
  if (!type || reason) return NextResponse.json({ error: reason ?? SHIPMENT_WRONG_TYPE }, { status: 400 });
  if (!isShipmentDocumentKey(key, shipmentId, shipmentFileExt(type))) {
    return NextResponse.json({ error: "That upload doesn't belong to this shipment." }, { status: 400 });
  }
  if (!(await prisma.shipment.findUnique({ where: { id: shipmentId }, select: { id: true } }))) {
    return NextResponse.json({ error: "That shipment is gone." }, { status: 404 });
  }
  try {
    const head = await headObject(key);
    if (head.ContentLength !== size) {
      return NextResponse.json({ error: "The upload didn't arrive whole — try again." }, { status: 400 });
    }
    const prefix = await getObjectPrefix(key, PO_DOCUMENT_SIGNATURE_BYTES);
    if (poDocumentContentsReason(type, prefix)) {
      await deleteObject(key).catch(() => {});
      return NextResponse.json({ error: CONTENTS }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "The upload didn't arrive — try again." }, { status: 400 });
  }

  try {
    const doc = await prisma.$transaction(async (tx) => {
      // An "other" paper is replaced only by name (its own row); a slot replaces whatever is current.
      if (other && !replaces) {
        const clash = await tx.shipmentDocument.findFirst({
          where: { shipmentId, type: "OTHER", label, supersededAt: null },
          select: { id: true },
        });
        if (clash) throw new NameTaken();
      }
      const replaced = await tx.shipmentDocument.updateMany({
        where: other
          ? { id: replaces ?? "", shipmentId, type: "OTHER", supersededAt: null }
          : { shipmentId, type: docType, supersededAt: null },
        data: { supersededAt: new Date() },
      });
      const created = await tx.shipmentDocument.create({
        data: {
          shipmentId,
          type: docType,
          label,
          r2Key: key,
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
          action: replaced.count ? "SHIPMENT_DOC_REPLACED" : "SHIPMENT_DOC_UPLOADED",
          text: `${replaced.count ? "replaced" : "uploaded"} the ${docPhrase({ type: docType, label })} ${name}`,
        },
      });
      return created;
    });
    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath("/shipments");
    return NextResponse.json({ id: doc.id });
  } catch (cause) {
    if (cause instanceof NameTaken) {
      await deleteObject(key).catch(() => {});
      return NextResponse.json({ error: "Another document already has that name." }, { status: 409 });
    }
    console.error("[shipments] complete", cause);
    return NextResponse.json({ error: "We couldn't save that file." }, { status: 500 });
  }
}
