import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { guardRoute } from "@/lib/api-guard";
import { listDocumentFolders } from "@/lib/queries/buyer-documents";
import { prisma } from "@/lib/prisma";
import { headObject } from "@/lib/r2";
import {
  BUYER_DOCUMENT_TYPES,
  canonicalFolder,
  documentCompleteSchema,
  documentRejectionReason,
  isBuyerDocumentKey,
  resolveDocumentType,
} from "@/lib/validation/buyer-files";

/**
 * Files a document once its bytes are in R2. Everything the browser says is
 * checked again: the key must be one `presign` could have minted for this
 * buyer, and the object's real size must be the size declared — a signature
 * only proves what was asked for, not what arrived.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, denied } = await guardRoute("buyer.manage");
  if (denied) return denied;
  const { id: buyerId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const parsed = documentCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Malformed request." },
      { status: 400 },
    );
  }
  const { key, name, size } = parsed.data;
  const type = resolveDocumentType(name, parsed.data.type);
  const reason = documentRejectionReason({ name, type: parsed.data.type, size });
  if (!type || reason) {
    return NextResponse.json({ error: reason ?? "That file type isn't supported" }, { status: 400 });
  }
  if (!isBuyerDocumentKey(key, buyerId, BUYER_DOCUMENT_TYPES[type].ext)) {
    return NextResponse.json({ error: "That upload doesn't belong here." }, { status: 400 });
  }

  try {
    const head = await headObject(key);
    if (head.ContentLength !== size) {
      return NextResponse.json({ error: "The upload didn't arrive whole — try again." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "The upload didn't arrive — try again." }, { status: 400 });
  }

  const folder = canonicalFolder(parsed.data.folder, await listDocumentFolders());
  try {
    const document = await prisma.buyerDocument.create({
      data: {
        buyerId,
        folder,
        r2Key: key,
        originalName: name,
        mimeType: type,
        sizeBytes: size,
        uploadedById: user.id,
      },
      select: { id: true },
    });
    revalidatePath(`/buyers/${buyerId}`);
    revalidatePath(`/admin/buyers/${buyerId}`);
    return NextResponse.json({ id: document.id, folder });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002: already filed (a retried complete). P2003: the buyer went.
      if (cause.code === "P2002") return NextResponse.json({ error: "Already saved." }, { status: 409 });
      if (cause.code === "P2003") return NextResponse.json({ error: "That buyer is gone." }, { status: 404 });
    }
    console.error("[buyer-documents] complete", cause);
    return NextResponse.json({ error: "We couldn't save that file." }, { status: 500 });
  }
}
