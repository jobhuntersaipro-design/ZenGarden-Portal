import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { BookingStatus } from "@/generated/prisma/enums";
import { guardRoute } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { PENDING_KEY_PREFIX, bookingKey, presignPut } from "@/lib/r2";
import type { PresignResponse } from "@/app/api/upload/presign/route";
import {
  type AcceptedMimeType,
  extensionFor,
  presignRequestSchema,
  rejectionReason,
} from "@/lib/validation/upload";

/**
 * Upload URLs for booking confirmations. The PO intake's presign, answering
 * the same shape so the same upload queue drives both: a row is created
 * first (UPLOADING, never listed) so its key carries its own id.
 */
export async function POST(request: Request) {
  const { user, denied } = await guardRoute("bc.upload");
  if (denied) return denied;

  const parsed = presignRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Malformed request." },
      { status: 400 },
    );
  }

  const response: PresignResponse = { files: [], errors: [] };
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  for (const file of parsed.data.files) {
    const reason = rejectionReason(file);
    if (reason) {
      response.errors.push({ name: file.name, reason });
      continue;
    }
    const mimeType = file.type as AcceptedMimeType;
    try {
      const { id } = await prisma.bookingConfirmation.create({
        data: {
          r2Key: `${PENDING_KEY_PREFIX}${randomUUID()}`,
          originalName: file.name,
          mimeType,
          sizeBytes: file.size,
          status: BookingStatus.UPLOADING,
          uploadedById: user.id,
        },
        select: { id: true },
      });
      const key = bookingKey(id, extensionFor(mimeType));
      await prisma.bookingConfirmation.update({ where: { id }, data: { r2Key: key } });
      response.files.push({
        name: file.name,
        documentId: id,
        key,
        url: await presignPut(key, mimeType, file.size),
        expiresAt,
      });
    } catch (cause) {
      console.error("[booking] presign failed", cause);
      response.errors.push({ name: file.name, reason: "We couldn't start that upload" });
    }
  }
  return NextResponse.json(response);
}
