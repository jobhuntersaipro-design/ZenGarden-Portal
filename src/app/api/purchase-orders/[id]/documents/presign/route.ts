import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { guardOrderDocumentWrite } from "@/lib/purchase-order-document-guard";
import { prisma } from "@/lib/prisma";
import { presignPut } from "@/lib/r2";
import {
  PO_DOCUMENT_TYPES,
  PO_DOCUMENT_WRONG_TYPE,
  poDocumentPresignSchema,
  poDocumentRejectionReason,
  purchaseOrderDocumentKey,
  resolvePoDocumentType,
} from "@/lib/validation/po-files";

export type PresignedPurchaseOrderDocument = {
  name: string;
  key: string;
  /** The type the PUT must declare: it is pinned into the signature. */
  type: string;
  url: string;
};

/**
 * One upload URL for a file on this order. Straight to R2 from the browser,
 * the same bucket the account documents use. No row is written until
 * `complete` has seen the object and its bytes.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { denied } = await guardOrderDocumentWrite();
  if (denied) return denied;
  const { id: purchaseOrderId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const parsed = poDocumentPresignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Malformed request." },
      { status: 400 },
    );
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { id: true },
  });
  if (!order) return NextResponse.json({ error: "That order is gone." }, { status: 404 });

  const file = parsed.data.files[0];
  const reason = poDocumentRejectionReason(file);
  const type = resolvePoDocumentType(file.name, file.type);
  if (reason || !type) {
    return NextResponse.json(
      { error: reason ?? PO_DOCUMENT_WRONG_TYPE },
      { status: 400 },
    );
  }

  const key = purchaseOrderDocumentKey(purchaseOrderId, randomUUID(), PO_DOCUMENT_TYPES[type].ext);
  try {
    const signed: PresignedPurchaseOrderDocument = {
      name: file.name,
      key,
      type,
      url: await presignPut(key, type, file.size),
    };
    return NextResponse.json(signed);
  } catch (cause) {
    console.error("[po-documents] presign failed", cause);
    return NextResponse.json({ error: "We couldn't start that upload." }, { status: 500 });
  }
}
