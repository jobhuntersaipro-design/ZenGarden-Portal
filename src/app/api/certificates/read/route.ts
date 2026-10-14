import { NextResponse } from "next/server";
import { z } from "zod";
import { superAdminRoute } from "@/lib/super-admin-route";
import { extractCertificate } from "@/lib/extraction/extract-certificate";
import { getObjectBytes } from "@/lib/r2";
import { CERT_KEY } from "@/lib/validation/certificates";
import { ACCEPTED_MIME_TYPES } from "@/lib/validation/upload";

/** Claude reads inside this request, as the PO intake does. */
export const maxDuration = 120;

const bodySchema = z.object({
  key: z.string().regex(CERT_KEY),
  type: z.enum(ACCEPTED_MIME_TYPES),
});

/** Read the type, number and expiry off an uploaded certificate. */
export async function POST(request: Request) {
  const denied = await superAdminRoute();
  if (denied) return denied;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  try {
    const bytes = await getObjectBytes(parsed.data.key);
    return NextResponse.json(await extractCertificate(bytes, parsed.data.type));
  } catch (cause) {
    console.error("[certificates] read failed", cause);
    const message = cause instanceof Error ? cause.message : "";
    return NextResponse.json(
      { error: message || "We couldn't read that certificate — enter the expiry by hand" },
      { status: 422 },
    );
  }
}
