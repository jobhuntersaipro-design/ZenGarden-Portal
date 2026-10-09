"use server";

import { revalidatePath } from "next/cache";
import { BookingStatus } from "@/generated/prisma/enums";
import { UnauthorizedError } from "@/lib/auth-guards";
import type { PermissionKey } from "@/lib/permissions/actions";
import { requirePermission } from "@/lib/permissions/require";
import { prisma } from "@/lib/prisma";
import { deleteObject, getObjectBytes, isPendingKey } from "@/lib/r2";
import { asDateColumn, runBookingExtraction } from "@/lib/extraction/extract-booking";
import { bookingFieldsSchema, type BookingFieldsInput } from "@/lib/validation/booking-confirmations";
import type { ActionResult } from "@/actions/purchase-orders";

const LIST = "/booking-confirmations";

const guard = async (key: PermissionKey) => {
  try {
    return { user: await requirePermission(key), error: null };
  } catch (cause) {
    return {
      user: null,
      error: cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }
};

/**
 * Saves the fields and marks the booking reviewed by whoever saved it. Saving
 * a reviewed one again is a correction, and the reviewer becomes the one who
 * made it — "Reviewed by" is the last person to vouch for these values.
 */
export async function reviewBookingConfirmation(
  id: string,
  input: BookingFieldsInput,
): Promise<ActionResult> {
  const { user, error } = await guard("bc.review");
  if (!user) return { success: false, error };

  const parsed = bookingFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  }
  const fields = parsed.data;
  try {
    // Only once the read has settled: saving over a read still running would
    // be overwritten by it a moment later.
    const { count } = await prisma.bookingConfirmation.updateMany({
      where: {
        id,
        status: { in: [BookingStatus.NEEDS_REVIEW, BookingStatus.FAILED, BookingStatus.REVIEWED] },
      },
      data: {
        ...fields,
        etdPol: asDateColumn(fields.etdPol),
        etaPod: asDateColumn(fields.etaPod),
        etaFinalDestination: asDateColumn(fields.etaFinalDestination),
        status: BookingStatus.REVIEWED,
        error: null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
    if (count === 0) {
      return { success: false, error: "That booking confirmation is still being read, or is gone." };
    }
    revalidatePath(LIST);
    revalidatePath(`${LIST}/${id}`);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[booking] review", cause);
    return { success: false, error: "We couldn't save that booking confirmation." };
  }
}

/** Reads a FAILED booking again. `bc.upload`: the uploader retries from the queue. */
export async function retryBookingConfirmation(
  id: string,
): Promise<ActionResult<{ status: BookingStatus; error: string | null }>> {
  const { user, error } = await guard("bc.upload");
  if (!user) return { success: false, error };

  const booking = await prisma.bookingConfirmation.findUnique({
    where: { id },
    select: { id: true, status: true, r2Key: true, mimeType: true },
  });
  if (!booking) return { success: false, error: "That file is gone." };
  if (booking.status !== BookingStatus.FAILED) {
    return { success: false, error: "That file isn't waiting on a retry." };
  }
  const outcome = await runBookingExtraction({
    id: booking.id,
    r2Key: booking.r2Key,
    mimeType: booking.mimeType,
    getBytes: getObjectBytes,
  });
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${id}`);
  return { success: true, data: outcome };
}

/**
 * Removes a booking and its file. One nobody has reviewed is work in progress
 * and anyone who may upload can clear it; a reviewed one needs `bc.review`.
 */
export async function deleteBookingConfirmation(id: string): Promise<ActionResult> {
  try {
    await requirePermission("bc.upload");
    const booking = await prisma.bookingConfirmation.findUnique({
      where: { id },
      select: { status: true, r2Key: true },
    });
    if (!booking) return { success: false, error: "That booking confirmation is gone." };
    if (booking.status === BookingStatus.REVIEWED) {
      await requirePermission("bc.review", "Only a reviewer can delete a reviewed booking confirmation.");
    }
    await prisma.bookingConfirmation.delete({ where: { id } });
    // After the row, and never fatal: an object left in R2 is cheaper than
    // reporting a failure once the list is already right.
    if (!isPendingKey(booking.r2Key)) {
      await deleteObject(booking.r2Key).catch((cause) =>
        console.error("[booking] delete could not remove the object", cause),
      );
    }
    revalidatePath(LIST);
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
    console.error("[booking] delete", cause);
    return { success: false, error: "We couldn't delete that booking confirmation." };
  }
}

/**
 * A row removed from the upload queue before its file finished arriving.
 * Owner-only and UPLOADING-only, so removing a finished row from the queue
 * never deletes the booking it became.
 */
export async function cancelBookingUpload(id: string): Promise<ActionResult> {
  const { user, error } = await guard("bc.upload");
  if (!user) return { success: false, error };
  const booking = await prisma.bookingConfirmation.findFirst({
    where: { id, uploadedById: user.id, status: BookingStatus.UPLOADING },
    select: { r2Key: true },
  });
  if (!booking) return { success: true, data: undefined };
  await prisma.bookingConfirmation.delete({ where: { id } });
  if (!isPendingKey(booking.r2Key)) await deleteObject(booking.r2Key).catch(() => {});
  return { success: true, data: undefined };
}

/**
 * Names the purchase order a booking ships, or clears it with null. Not a
 * review: the booking's status and reviewer stay as they are.
 */
export async function linkBookingToPurchaseOrder(
  id: string,
  purchaseOrderId: string | null,
): Promise<ActionResult> {
  const { user, error } = await guard("bc.review");
  if (!user) return { success: false, error };
  try {
    if (purchaseOrderId) {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        select: { id: true },
      });
      if (!po) return { success: false, error: "That purchase order is gone." };
    }
    const before = await prisma.bookingConfirmation.findUnique({
      where: { id },
      select: { purchaseOrderId: true },
    });
    if (!before) return { success: false, error: "That booking confirmation is gone." };
    await prisma.bookingConfirmation.update({ where: { id }, data: { purchaseOrderId } });
    revalidatePath(`${LIST}/${id}`);
    for (const poId of [before.purchaseOrderId, purchaseOrderId]) {
      if (poId) revalidatePath(`/purchase-orders/${poId}`);
    }
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[booking] link", cause);
    return { success: false, error: "We couldn't link that purchase order." };
  }
}
