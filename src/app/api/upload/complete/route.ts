import { NextResponse } from "next/server";
import { ExtractionStatus } from "@/generated/prisma/enums";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { findOwnedDocument } from "@/lib/queries/documents";
import { deleteObject, headObject } from "@/lib/r2";
import { completeRequestSchema } from "@/lib/validation/upload";

/** Phase 04 runs extraction inline here; the budget is reserved now. */
export const maxDuration = 120;

export type CompleteResponse = { extractionId: string };

/**
 * The presigned URL proves what the client *declared*. This proves what
 * actually landed: R2 is asked for the object's real length and type, and a
 * mismatch throws the whole upload away rather than recording a document whose
 * bytes are not what the row says they are.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json({ error: cause.message }, { status: 401 });
    }
    throw cause;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const parsed = completeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const document = await findOwnedDocument(parsed.data.documentId, user.id);
  // 404 rather than 403: someone probing another user's ids learns nothing
  // about whether they exist.
  if (!document) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (document.extraction) {
    return NextResponse.json({
      extractionId: document.extraction.id,
    } satisfies CompleteResponse);
  }

  try {
    const head = await headObject(document.r2Key);
    const sizeMatches = head.ContentLength === document.sizeBytes;
    const typeMatches = head.ContentType === document.mimeType;
    if (!sizeMatches || !typeMatches) throw new Error("mismatch");
  } catch (cause) {
    console.error("[upload] complete verification failed", cause);
    // The row describes bytes that are not there, so neither is kept.
    try {
      await deleteObject(document.r2Key);
    } catch {
      // Nothing to delete is the expected case here.
    }
    await prisma.document.delete({ where: { id: document.id } });
    return NextResponse.json(
      { error: "Upload did not complete" },
      { status: 400 },
    );
  }

  const extraction = await prisma.extraction.create({
    data: {
      documentId: document.id,
      status: ExtractionStatus.PENDING,
      // Carried from buyer detail's "Upload PO" so the review screen in Phase
      // 04 can preselect the buyer the user came from.
      ...(parsed.data.hintBuyerId
        ? { draftJson: { buyerId: parsed.data.hintBuyerId } }
        : {}),
    },
    select: { id: true },
  });

  return NextResponse.json({
    extractionId: extraction.id,
  } satisfies CompleteResponse);
}
