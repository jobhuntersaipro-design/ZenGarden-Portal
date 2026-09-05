import { NextResponse } from "next/server";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { isPendingKey, presignGet } from "@/lib/r2";

export type DocumentUrlResponse = { url: string; mimeType: string };

/**
 * A short-lived read URL for the review screen's source column and, from Phase
 * 05, the PO detail page.
 *
 * Any signed-in member may read any document: the portal is one small ops team
 * and a PO uploaded by a colleague is exactly what the next person has to
 * review (docs/specs/04-extraction-review.md §3). The URL still expires in ten
 * minutes, so it is not something to paste around.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    await requireUser();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json({ error: cause.message }, { status: 401 });
    }
    throw cause;
  }

  const { documentId } = await params;
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { r2Key: true, mimeType: true, originalName: true },
  });
  if (!document || isPendingKey(document.r2Key)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    url: await presignGet(document.r2Key),
    mimeType: document.mimeType,
  } satisfies DocumentUrlResponse);
}
