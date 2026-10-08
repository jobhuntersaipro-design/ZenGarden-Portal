import { NextResponse } from "next/server";
import { BookingStatus } from "@/generated/prisma/enums";
import { guardRoute } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/r2";
import type { DocumentUrlResponse } from "@/app/api/documents/[documentId]/url/route";

/**
 * A ten-minute read link for a booking confirmation's file, for the preview
 * and `?download=1`. Its own route, guarded by `bc.view`, so the PO document
 * route never has to know bookings exist.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { denied } = await guardRoute("bc.view");
  if (denied) return denied;

  const { id } = await params;
  const booking = await prisma.bookingConfirmation.findUnique({
    where: { id },
    select: { r2Key: true, mimeType: true, originalName: true, status: true },
  });
  if (!booking || booking.status === BookingStatus.UPLOADING) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const download = new URL(request.url).searchParams.get("download") === "1";
  return NextResponse.json({
    url: await presignGet(booking.r2Key, download ? booking.originalName : undefined),
    mimeType: booking.mimeType,
  } satisfies DocumentUrlResponse);
}
