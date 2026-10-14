import { NextResponse } from "next/server";
import type { DocumentUrlResponse } from "@/app/api/documents/[documentId]/url/route";
import { superAdminRoute } from "@/lib/super-admin-route";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/r2";

/**
 * Opens a certificate's file: a redirect to a ten-minute R2 link, or with
 * `?preview=1` the link and type as JSON, for the form's preview.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await superAdminRoute();
  if (denied) return denied;
  const { id } = await params;
  const cert = await prisma.certificate.findUnique({
    where: { id },
    select: { r2Key: true, originalName: true, mimeType: true },
  });
  if (!cert) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const search = new URL(request.url).searchParams;
  if (search.get("preview") === "1") {
    return NextResponse.json({
      url: await presignGet(cert.r2Key),
      mimeType: cert.mimeType,
    } satisfies DocumentUrlResponse);
  }
  const download = search.get("download") === "1";
  return NextResponse.redirect(
    await presignGet(cert.r2Key, download ? cert.originalName : undefined),
  );
}
