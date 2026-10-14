import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { superAdminRoute } from "@/lib/super-admin-route";
import { presignPut } from "@/lib/r2";
import {
  type AcceptedMimeType,
  extensionFor,
  rejectionReason,
  uploadFileSchema,
} from "@/lib/validation/upload";

export type PresignedCertificate = { key: string; url: string };

/**
 * One upload URL for a certificate file. No row yet: the certificate is
 * written by `saveCertificate`, which checks the object landed.
 * ponytail: a file uploaded and never saved stays in R2; sweep `certificates/`
 * against `Certificate.r2Key` if that ever adds up.
 */
export async function POST(request: Request) {
  const denied = await superAdminRoute();
  if (denied) return denied;
  const parsed = uploadFileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  const reason = rejectionReason(parsed.data);
  if (reason) return NextResponse.json({ error: reason }, { status: 400 });

  const mimeType = parsed.data.type as AcceptedMimeType;
  const key = `certificates/${randomUUID()}.${extensionFor(mimeType)}`;
  try {
    const signed: PresignedCertificate = {
      key,
      url: await presignPut(key, mimeType, parsed.data.size),
    };
    return NextResponse.json(signed);
  } catch (cause) {
    console.error("[certificates] presign failed", cause);
    return NextResponse.json({ error: "We couldn't start that upload." }, { status: 500 });
  }
}
