import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { BookingStatus } from "@/generated/prisma/enums";
import { guardRoute } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { deleteObject, getObjectBytes, headObject } from "@/lib/r2";
import { runBookingExtraction } from "@/lib/extraction/extract-booking";
import { completeRequestSchema } from "@/lib/validation/upload";

/** Claude reads the file inside this request, as the PO intake does. */
export const maxDuration = 120;

/**
 * Checks what actually landed in R2 against what the row declared, then reads
 * it. Answers the PO complete route's shape (`extractionId` is the booking's
 * own id) so the shared upload queue can drive it.
 */
export async function POST(request: Request) {
  const { user, denied } = await guardRoute("bc.upload");
  if (denied) return denied;

  const parsed = completeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // 404 for someone else's upload: probing ids learns nothing.
  const booking = await prisma.bookingConfirmation.findFirst({
    where: { id: parsed.data.documentId, uploadedById: user.id },
    select: { id: true, r2Key: true, mimeType: true, sizeBytes: true, status: true, error: true },
  });
  if (!booking) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // A retried complete: report what already happened rather than read twice.
  if (booking.status !== BookingStatus.UPLOADING) {
    return NextResponse.json({
      extractionId: booking.id,
      status: booking.status,
      error: booking.error,
    });
  }

  try {
    const head = await headObject(booking.r2Key);
    if (head.ContentLength !== booking.sizeBytes || head.ContentType !== booking.mimeType) {
      throw new Error("mismatch");
    }
  } catch (cause) {
    console.error("[booking] complete verification failed", cause);
    await deleteObject(booking.r2Key).catch(() => {});
    await prisma.bookingConfirmation.delete({ where: { id: booking.id } });
    return NextResponse.json({ error: "Upload did not complete" }, { status: 400 });
  }

  const outcome = await runBookingExtraction({
    id: booking.id,
    r2Key: booking.r2Key,
    mimeType: booking.mimeType,
    getBytes: getObjectBytes,
  });
  revalidatePath("/booking-confirmations");
  return NextResponse.json({ extractionId: booking.id, ...outcome });
}
