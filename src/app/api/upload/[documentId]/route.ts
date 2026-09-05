import { NextResponse } from "next/server";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { findOwnedDocument } from "@/lib/queries/documents";
import { deleteObject, isPendingKey } from "@/lib/r2";

/**
 * Removing a row from the upload queue. Owner-only, and only while no
 * Extraction exists — once extraction has started the document belongs to the
 * review flow, not to the queue (docs/specs/03-upload.md §2).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  let user;
  try {
    user = await requireUser();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json({ error: cause.message }, { status: 401 });
    }
    throw cause;
  }

  const { documentId } = await params;
  const document = await findOwnedDocument(documentId, user.id);
  // 404 for someone else's document, same as the complete route.
  if (!document) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (document.extraction) {
    return NextResponse.json(
      { error: "That file is already being read." },
      { status: 409 },
    );
  }

  if (!isPendingKey(document.r2Key)) {
    try {
      await deleteObject(document.r2Key);
    } catch (cause) {
      // The upload may have been aborted before anything landed. The row still
      // has to go, or the queue would show a file the user just removed.
      console.error(`[upload] could not delete ${document.r2Key}`, cause);
    }
  }
  await prisma.document.delete({ where: { id: document.id } });

  return new NextResponse(null, { status: 204 });
}
