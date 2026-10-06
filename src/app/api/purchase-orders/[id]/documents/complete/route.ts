import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { guardOrderDocumentWrite } from "@/lib/purchase-order-document-guard";
import { listDocumentFolders } from "@/lib/queries/buyer-documents";
import { prisma } from "@/lib/prisma";
import { deleteObject, getObjectPrefix, headObject } from "@/lib/r2";
import {
  PO_DOCUMENT_CONTENTS,
  PO_DOCUMENT_SIGNATURE_BYTES,
  PO_DOCUMENT_TYPES,
  canonicalPoDocumentCategory,
  isPurchaseOrderDocumentKey,
  poDocumentCompleteSchema,
  poDocumentContentsReason,
  poDocumentRejectionReason,
  resolvePoDocumentType,
} from "@/lib/validation/po-files";

/**
 * Files a document once its bytes are in R2. The key must be one `presign`
 * could have minted for this order, the object's real size must be the size
 * declared, and the leading bytes must be the format the name claimed.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, denied } = await guardOrderDocumentWrite();
  if (denied) return denied;
  const { id: purchaseOrderId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const parsed = poDocumentCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Malformed request." },
      { status: 400 },
    );
  }
  const { key, name, size } = parsed.data;
  const type = resolvePoDocumentType(name, parsed.data.type);
  const reason = poDocumentRejectionReason({ name, type: parsed.data.type, size });
  if (!type || reason) {
    return NextResponse.json(
      { error: reason ?? "That file type isn't supported — use PDF, JPG or PNG" },
      { status: 400 },
    );
  }
  if (!isPurchaseOrderDocumentKey(key, purchaseOrderId, PO_DOCUMENT_TYPES[type].ext)) {
    return NextResponse.json({ error: "That upload doesn't belong to this order." }, { status: 400 });
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { id: true },
  });
  if (!order) return NextResponse.json({ error: "That order is gone." }, { status: 404 });

  try {
    const head = await headObject(key);
    if (head.ContentLength !== size) {
      return NextResponse.json({ error: "The upload didn't arrive whole — try again." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "The upload didn't arrive — try again." }, { status: 400 });
  }

  let prefix: Uint8Array;
  try {
    prefix = await getObjectPrefix(key, PO_DOCUMENT_SIGNATURE_BYTES);
  } catch (cause) {
    console.error("[po-documents] could not read the upload", cause);
    return NextResponse.json({ error: "The upload didn't arrive — try again." }, { status: 400 });
  }
  if (poDocumentContentsReason(type, prefix)) {
    await deleteObject(key).catch((cause) =>
      console.error("[po-documents] could not delete a rejected upload", cause),
    );
    return NextResponse.json({ error: PO_DOCUMENT_CONTENTS }, { status: 400 });
  }

  const category = canonicalPoDocumentCategory(parsed.data.category, await listDocumentFolders());
  try {
    const document = await prisma.purchaseOrderDocument.create({
      data: {
        purchaseOrderId,
        category,
        r2Key: key,
        originalName: name,
        mimeType: type,
        sizeBytes: size,
        uploadedById: user.id,
        uploadedByName: user.name,
      },
      select: { id: true },
    });
    revalidatePath(`/purchase-orders/${purchaseOrderId}`);
    return NextResponse.json({ id: document.id, category });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError) {
      if (cause.code === "P2002") return NextResponse.json({ error: "Already saved." }, { status: 409 });
      if (cause.code === "P2003") return NextResponse.json({ error: "That order is gone." }, { status: 404 });
    }
    console.error("[po-documents] complete", cause);
    return NextResponse.json({ error: "We couldn't save that file." }, { status: 500 });
  }
}
