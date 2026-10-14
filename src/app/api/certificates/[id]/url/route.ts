import { NextResponse } from "next/server";
import { superAdminRoute } from "@/lib/super-admin-route";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/r2";

/** Opens a certificate's file: a redirect to a ten-minute R2 link. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await superAdminRoute();
  if (denied) return denied;
  const { id } = await params;
  const cert = await prisma.certificate.findUnique({
    where: { id },
    select: { r2Key: true, originalName: true },
  });
  if (!cert) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return NextResponse.redirect(
    await presignGet(cert.r2Key, download ? cert.originalName : undefined),
  );
}
